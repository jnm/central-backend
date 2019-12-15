// Copyright 2017 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.
//
// This is the main entrypoint for the actual HTTP server. It sets up the
// dependency container and feeds it to the service infrastructure.

const { merge } = require('ramda');
const config = require('config');
const exit = require('express-graceful-exit');

////////////////////////////////////////////////////////////////////////////////
// CONTAINER SETUP

// initialize our top-level static database instance.
const { connect } = require('../model/database');
const db = connect(config.get('default.database'));

// set up our mailer.
const env = config.get('default.env');
const { mailer } = require('../outbound/mail');
const mail = mailer(merge(config.get('default.email'), { env }));

// get a google client.
const googler = require('../outbound/google');
const google = googler(config.get('default.external.google'));

// get a sentry and xlsform client, and a crypto module.
const Sentry = require('../util/sentry').init(config.get('default.external.sentry'));
const xlsform = require('../util/xlsform').init(config.get('default.xlsform'));
const crypto = require('../util/crypto');

// get an Enketo client
const enketo = require('../util/enketo').init(config.get('default.enketo'));


////////////////////////////////////////////////////////////////////////////////
// START HTTP SERVICE

// initialize our container, then generate an http service out of it.
const container = require('../model/package').withDefaults({ db, mail, env, google, Sentry, crypto, xlsform, enketo });
const service = require('../http/service')(container);

// insert the graceful exit middleware.
service.use(exit.middleware(service));

// start the service.
const server = service.listen(config.get('default.server.port'), () => {
  // notify parent process we are alive if applicable.
  if (process.send != null) process.send('online');
});


////////////////////////////////////////////////////////////////////////////////
// START WORKER

const { worker } = require('../worker/worker');
worker(container);


////////////////////////////////////////////////////////////////////////////////
// CLEANUP

let termed = false;
const term = () => {
  if (termed === true) {
    process.stderr.write('got INT/TERM a second time; exiting forcefully.\n');
    return process.exit(-1);
  }
  termed = true;

  exit.gracefulExitHandler(service, server, {
    log: true,
    exitProcess: false,
    callback: () => db.destroy(() => process.exit(0))
  });
};

process.on('SIGINT', term); // ^C
process.on('SIGTERM', term);

process.on('message', (message) => { // parent process.
  if (message === 'shutdown') term();
});


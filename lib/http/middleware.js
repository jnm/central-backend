// Copyright 2017 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.

// we do something a tiny bit unconventional in this project: we use actual express
// middleware very very sparingly: essentially, only middleware that rewrites the
// incoming url are actual express middleware.
//
// a lot of the other things you might normally expect to find--header parsers,
// auth checkers, and so on--are split between the preprocessors.js and the
// endpoints.js files. they are not implemented as express middleware, because
// we would like for the entire requestpath to run within a single Promise context,
// so that we can manage the database transaction without awkward contortions.

const Problem = require('../util/problem');
const Option = require('../util/option');


// Strips a /v# prefix off the request path and exposes on the request object
// under the apiVersion property.
const versionParser = (request, response, next) => {
  // this code will all break when we hit version 10 a century from now.
  const match = /^\/v(\d)\//.exec(request.url);
  if (match == null) return next(Problem.user.missingApiVersion());
  request.apiVersion = Number(match[1]);
  if (request.apiVersion !== 1) return next(Problem.user.unexpectedApiVersion({ got: match[1] }));
  request.url = request.url.slice(3);
  next();
};

// Similarly, we need to process fieldkey URLs and rewrite them before routing
// occurs. if found, we just rewrite and store the value on request.
const fieldKeyParser = (request, response, next) => {
  // TODO: move this URL decoding somewhere more generic, if it's even desirable
  request.url = decodeURIComponent(request.url);
  const match = /^\/key\/([a-z0-9!$]{64})\//i.exec(request.url);

  request.fieldKey = Option.of(match).map((m) => m[1]);
  if (match != null) request.url = request.url.slice('/key/'.length + match[1].length);

  next();
};


module.exports = { versionParser, fieldKeyParser };


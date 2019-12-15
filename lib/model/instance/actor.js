// Copyright 2017 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.
//
// Actors are objects which can be granted access permissions to Actees. There
// are many types of Actors, like Users (people who can interactively log into
// the site with a password) and Single Use Actors (temporary permissions records
// created to allow one-time actions like password resets). When these Actor types
// need to remember additional information, they get tables and Instances of their
// own, which _contain reference_ to their Actor object, rather than inherit.
//
// Actors can also be added to other Actors. In this case, they inherit all the
// rights of their parents (though in the next major release it is likely we will
// add scoped membership). Typically, this is used to add Users to Groups, but other
// uses are possible, like adding Proxies to Users to allow scripts to act on behalf
// of Users.

const Instance = require('./instance');
const Problem = require('../../util/problem');
const { resolve, getOrReject } = require('../../util/promise');
const { withCreateTime, withUpdateTime } = require('../../util/instance');

const actorTypes = {
  system: 'system', user: 'user', group: 'group', proxy: 'proxy',
  singleUse: 'singleUse', fieldKey: 'field_key', previewKey: 'preview_key'
};
Object.freeze(actorTypes);

module.exports = Instance('actors', {
  all: [ 'id', 'type', 'acteeId', 'displayName', 'meta', 'createdAt', 'updatedAt', 'deletedAt' ],
  readable: [ 'id', 'type', 'displayName', 'createdAt', 'updatedAt' ],
  writable: [ 'displayName' ]
})(({ actors, roles, simply }) => class {

  forCreate() { return withCreateTime(this); }
  forUpdate() { return withUpdateTime(this); }

  create() { return actors.create(this); }

  // Performs a soft-delete on the Actor, setting deletedAt to the current date.
  delete() { return simply.markDeleted('actors', this); }

  // Does nothing unless this is a single use actor, in which case the actor will
  // be deleted.
  consume() {
    if (this.type !== 'singleUse') return null;
    return this.delete();
  }

  assignRole(role, actee) {
    const roleId = (role.id != null) ? role.id : role;
    const acteeId = (actee.acteeId != null) ? actee.acteeId : actee;
    return actors.assignRole(this.id, roleId, acteeId);
  }

  unassignRole(role, actee) {
    const roleId = (role.id != null) ? role.id : role;
    const acteeId = (actee.acteeId != null) ? actee.acteeId : actee;
    return actors.unassignRole(this.id, roleId, acteeId);
  }

  assignSystemRole(roleSystemName, actee) {
    return roles.getBySystemName(roleSystemName)
      .then(getOrReject(Problem.internal.missingSystemRow('role')))
      .then((role) => this.assignRole(role, actee));
  }

  // you should never be able to assign verbs you yourself do not possess.
  canAssignRole(role, actee) {
    return this.verbsOn(actee)
      .then((hasArray) => {
        const has = new Set(hasArray);
        for (const required of role.verbs)
          if (!has.has(required))
            return false;
        return true;
      });
  }

  // returns a Promise[Boolean] indicating whether this Actor may perform
  // the given verb on the given Actee.
  can(verb, actee) {
    if (this.acteeId === actee.acteeId) {
      // rather than deal with granting every single user the row required to let them
      // access/edit their own data, we just deal with it in code here.
      // TODO: maybe this is a bad idea? i don't generally like code grants but it
      // doesn't feel necessarily more foolproof to depend on the database being in sync here.
      if ((verb === 'user.read') || (verb === 'user.update'))
        return resolve(true);

      // we also want users (but not app users) to be able to log themselves out.
      // again, i'm not the biggest fan of code grant approaches.
      if ((verb === 'session.end') && (this.type !== 'field_key'))
        return resolve(true);
    }

    return actors.can(this, verb, actee);
  }

  // returns an array of verbs the Actor may perform on the given actee.
  verbsOn(actee) { return actors.verbsOn(this.id, actee); }

  // manually implement acteeIds() rather than relying on ActeeTrait, since we
  // have a dynamic species type here.
  acteeIds() { return [ this.acteeId, this.type, '*' ]; }

  static getById(id) { return actors.getById(id); }

  static types() { return actorTypes; }

  static reapPreviewKeys() { return actors.reapPreviewKeys(); }
});


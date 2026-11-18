'use strict';

/** Fields that are safe to expose for an account. */
function publicUser(user) {
  if (!user) return null;
  return {
    email: user.email,
    firstname: user.firstname,
    lastname: user.lastname,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

module.exports = { publicUser };

'use strict';

const personService = require('../services/personService');

async function listPeople(req, res) {
  const people = await personService.listPeople(req.email);
  res.json(people);
}

async function renamePerson(req, res) {
  const person = await personService.renamePerson(
    req.params.personId,
    req.email,
    req.body.name,
  );
  res.json(person);
}

async function personPhotos(req, res) {
  const photos = await personService.listPhotosForPerson(req.params.personId, req.email);
  res.json(photos);
}

module.exports = { listPeople, renamePerson, personPhotos };

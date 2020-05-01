'use strict'

const { Assertion } = require('chai')
const c = require('./contract')

Assertion.addMethod('passValue', function (goodValue) {
  const { _obj: obj } = this
  new Assertion(obj).to.be.instanceof(c.Contract)
  new Assertion(obj.check(goodValue)).to.equal(goodValue)
})

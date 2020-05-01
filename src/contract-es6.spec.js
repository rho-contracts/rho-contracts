'use strict'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { expect } = require('chai')
const c = require('./contract')

describe('c.constructs', function () {
  describe('with a class', function () {
    class ExampleImpl {
      constructor(initialValue) {
        this.value = initialValue
      }

      inc() {
        this.value++
      }
    }

    const theContract = c.fun({ initialValue: c.number }).constructs({
      inc: c.fun().returns(c.number),
    })

    const Example = theContract.wrap(ExampleImpl)

    it('can construct', function () {
      const instance = new Example(10)
      expect(instance).to.include({ value: 10 })
    })

    it('allows `instanceof` and `isA` checks on the wrapped constructor', function () {
      const instance = new Example(5)
      expect(instance).to.be.an.instanceof(Example)
      expect(c.isA(Example)).to.passValue(instance)
    })

    it('allows `instanceof` and `isA` checks on the implementation', function () {
      const instance = new Example(5)
      expect(instance).to.be.an.instanceof(ExampleImpl)
      expect(c.isA(ExampleImpl)).to.passValue(instance)
    })
  })
})

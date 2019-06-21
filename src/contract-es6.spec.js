'use strict'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const c = require('./contract')

require('should')

describe('c.constructs', function() {
  describe('with a class', function() {
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

    it('can construct', function() {
      const instance = new Example(10)

      instance.value.should.be.eql(10)
    })

    it('allows `instanceof` and `isA` checks on the wrapped constructor', function() {
      const instance = new Example(5)
      instance.should.be['instanceof'](Example)
      c.isA(Example).check(instance).should.be.ok
    })

    it('allows `instanceof` and `isA` checks on the implementation', function() {
      const instance = new Example(5)
      instance.should.be['instanceof'](ExampleImpl)
      c.isA(ExampleImpl).check(instance).should.be.ok
    })
  })
})

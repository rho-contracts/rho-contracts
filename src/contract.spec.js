'use strict'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const fs = require('fs')
const { expect } = require('chai')
const c = require('./contract')
const errors = require('./contract-errors')

describe('toContract', function() {
  it('passes contracts', function() {
    expect(c.toContract(c.any).contractName).to.equal(c.any.contractName)
  })
  it('wrap objects', function() {
    expect(c.toContract({})).to.be.an.instanceof(c.Contract)
  })
  it('wrap objects recursively', function() {
    const kidPark = c.toContract({
      name: c.string,
      acres: c.number,
      playunit: {
        junglebars: c.bool,
        slides: c.number,
        ladders: [
          {
            color: c.string,
            size: c.string,
          },
        ],
      },
    })

    const example = {
      name: 'corner park',
      acres: 0.1,
      playunit: {
        junglebars: true,
        slides: 3,
        ladders: [
          {
            color: 'red',
            size: 'large',
          },
          {
            color: 'yellow',
            size: 'medium',
          },
        ],
      },
    }
    expect(kidPark.check(example)).to.deep.equal(example)
    example.playunit.ladders[1].size = 0
    expect(() => kidPark.check(example)).to.throw(
      errors.ContractError,
      /^Expected string/
    )
  })
  it('wraps arrays', function() {
    expect(c.toContract([c.any])).to.be.an.instanceof(c.Contract)
  })
  it('wraps values', function() {
    expect(c.toContract(5).contractName).to.equal(c.value(5).contractName)
  })
})

describe('any', function() {
  it('pass 5', function() {
    expect(c.any.check(5)).to.equal(5)
  })
})

describe('nothing', function() {
  it('rejects 5', function() {
    expect(() => c.nothing.check(5)).to.throw(errors.ContractError)
  })
  it('report check name', function() {
    expect(() => c.nothing.wrap(5, 'test')).to.throw(
      errors.ContractError,
      /test/
    )
  })
})

describe('value', function() {
  it('pass same', function() {
    expect(c.value(5)).to.passValue(5)
  })
  it('reject different', function() {
    expect(() => c.value(5).check(6)).to.throw(errors.ContractError)
  })
})

describe('string', function() {
  it('pass string', function() {
    expect(c.string).to.passValue('asd')
  })
  it('reject different', function() {
    expect(() => c.string.check(6)).to.throw(errors.ContractError)
  })
})

describe('Date', function() {
  it('pass Date', function() {
    expect(c.date).to.passValue(new Date())
  })
  it('reject different', function() {
    expect(() => c.date.check(6)).to.throw(errors.ContractError)
  })
})

describe('isA', function() {
  function ExampleImpl() {}
  it('detects a newly constructed object', function() {
    expect(c.isA(ExampleImpl)).to.passValue(new ExampleImpl())
  })

  it('rejects different', function() {
    expect(() => c.isA(ExampleImpl).check(new Date())).to.throw(
      errors.ContractError,
      /isA\(ExampleImpl\)/
    )
  })
})

describe('pred', function() {
  it('returns a contract', function() {
    expect(c.pred(() => false)).to.be.an.instanceof(c.Contract)
  })
})

describe('and', function() {
  it('passes two', function() {
    expect(c.and(c.string, c.value('asd'))).to.passValue('asd')
  })
  it('fails first', function() {
    expect(() => c.and(c.string, c.value('asd')).check(5)).to.throw(
      errors.ContractError
    )
  })
  it('fails second', function() {
    expect(() => c.and(c.string, c.value('asd')).check('aaa')).to.throw(
      errors.ContractError
    )
  })
})

describe('or', function() {
  it('passes first', function() {
    expect(c.or(c.string, c.value(6)).check('asd')).to.equal('asd')
  })
  it('passes second', function() {
    expect(c.or(c.string, c.value(6))).to.passValue(6)
  })
  it('fails', function() {
    expect(() => c.or(c.string, c.value(6)).check(0)).to.throw(
      errors.ContractError
    )
  })
  it('two fn cannot be wrapped', function() {
    expect(() =>
      c.or(c.fn(), c.fn()).wrap(function() {}, function() {})
    ).to.throw(/at most one/)
  })
})

describe('matches', function() {
  it('passes', function() {
    expect(c.matches(/x+/)).to.passValue('---xxxxx  ')
  })
  it('fail', function() {
    expect(() => c.matches(/x+/).check('---  ')).to.throw(errors.ContractError)
  })
  it('does not coerce null', function() {
    expect(() => c.matches(/null/).check(null)).to.throw(errors.ContractError)
  })
})

describe('array', function() {
  it('fails non-arrays', function() {
    expect(() => c.array(c.any).check(5)).to.throw(errors.ContractError)
  })
  it('passes empty', function() {
    expect(c.array(c.any)).to.passValue([])
  })
  it('passes simple', function() {
    expect(c.array(c.value(5))).to.passValue([5, 5])
  })
  it('fails first', function() {
    expect(() => c.array(c.value(5)).check([10, 5])).to.throw(
      errors.ContractError
    )
  })
  it('fails second', function() {
    expect(() => c.array(c.value(5)).check([5, 10])).to.throw(
      errors.ContractError
    )
  })
  it('passes nested', function() {
    expect(c.array(c.array(c.value(5)))).to.passValue([[5], [5, 5]])
  })
  it('fails nested', function() {
    expect(() => c.array(c.array(c.value(5))).check([[5], [5, 10]])).to.throw(
      errors.ContractError
    )
  })
})

describe('tuple', function() {
  it('fails non-arrays', function() {
    expect(() => c.tuple(c.any).check(5)).to.throw(errors.ContractError)
  })
  it('fails empty', function() {
    expect(() => c.tuple(c.any).check([])).to.throw(errors.ContractError)
  })
  it('passes simple', function() {
    expect(c.tuple(c.value(5), c.value(10))).to.passValue([5, 10])
  })
  it('passes longer', function() {
    expect(c.tuple(c.value(5), c.value(10))).to.passValue([5, 10, 'x'])
  })
  it('fails first', function() {
    expect(() => c.tuple(c.value(5), c.value(10)).check([10, 5])).to.throw(
      errors.ContractError
    )
  })
  it('fails second', function() {
    expect(() => c.tuple(c.value(5), c.value(10)).check([5, 20])).to.throw(
      errors.ContractError
    )
  })
  it('passes nested', function() {
    expect(
      c.tuple(c.string, c.tuple(c.value(5), c.string), c.number)
    ).to.passValue(['a', [5, 'b'], 5])
  })
  it('fails nested', function() {
    expect(() =>
      c
        .tuple(c.string, c.tuple(c.value(5), c.string), c.number)
        .check(['a', [5, 10], 5])
    ).to.throw(errors.ContractError)
  })
})

describe('hash', function() {
  it('passes', function() {
    expect(c.hash(c.string)).to.passValue({ x: 'aaa', y: 'bbb' })
  })
  it('fails', function() {
    expect(() => c.hash(c.string).check({ x: 'aaa', y: 5 })).to.throw(
      errors.ContractError
    )
  })
  it('wrap wraps fields and fails', function() {
    const x = { thk: function() {} }
    expect(() =>
      c
        .hash(c.fn())
        .wrap(x)
        .thk(5)
    ).to.throw(errors.ContractError, /Wrong number/)
  })
})

describe('object regression', function() {
  it('one wrapping field and one non-wrapping field', function() {
    expect(
      c
        .object({ x: c.string, fn: c.fn() })
        .wrap({ x: 'foo', fn: function() {} })
    ).to.include({ x: 'foo' })
  })
})

describe('object', function() {
  it('fails non-objects', function() {
    expect(() => c.object().check(5)).to.throw(errors.ContractError)
  })
  it('passes empty', function() {
    const value = {}
    expect(c.object().check(value)).to.equal(value)
  })
  it('passes simple', function() {
    const value = { x: 5 }
    expect(c.object({ x: c.value(5) }).check(value)).to.equal(value)
  })
  it('fails first', function() {
    expect(() =>
      c.object({ x: c.value(5), y: c.value(10) }).check({ x: 10, y: 10 })
    ).to.throw(errors.ContractError)
  })
  it('fails second', function() {
    expect(() =>
      c.object({ x: c.value(5), y: c.value(10) }).check({ x: 5, y: 2 })
    ).to.throw(errors.ContractError)
  })
  it('passes nested', function() {
    const value = { x: { y: 5 } }
    expect(c.object({ x: c.object({ y: c.value(5) }) }).check(value)).to.equal(
      value
    )
  })
  it('fails nested', function() {
    expect(() =>
      c.object({ x: c.object({ y: c.value(5) }) }).check({ x: { y: 10 } })
    ).to.throw(errors.ContractError)
  })
  it('fails missing field', function() {
    expect(() =>
      c.object({ x: c.value(5), y: c.value(10) }).check({ x: 5, z: 10 })
    ).to.throw(errors.ContractError)
  })
  it('fails missing field, nested', function() {
    expect(() =>
      c.object({ x: c.object({ y: c.value(5) }) }).check({ x: { z: 10 } })
    ).to.throw(errors.ContractError)
  })

  describe('option field', function() {
    it('when missing', function() {
      const value = { x: 5 }
      expect(
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check(value)
      ).to.equal(value)
    })
    it('when null', function() {
      const value = { x: 5, y: null }
      expect(
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check(value)
      ).to.equal(value)
    })
    it('when undefined', function() {
      const value = { x: 5, y: undefined }
      expect(
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check(value)
      ).to.equal(value)
    })
    it('when present', function() {
      const value = { x: 5, y: 10 }
      expect(
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check(value)
      ).to.equal(value)
    })
    it('rejects when mismatched', function() {
      expect(() =>
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check({
          x: 5,
          y: 5,
        })
      ).to.throw(errors.ContractError)
    })
    it('rejects when falsy', function() {
      expect(() =>
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check({
          x: 5,
          y: '',
        })
      ).to.throw(errors.ContractError)
    })
    it('rejects when NaN', function() {
      expect(() =>
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check({
          x: 5,
          y: 0 / 0,
        })
      ).to.throw(errors.ContractError)
    })
    it('nested and mismatched', function() {
      expect(() =>
        c
          .object({
            x: c.value(5),
            y: c.optional(c.object({ z: c.value(10) })),
          })
          .check({ x: 5, y: { z: 0 } })
      ).to.throw(errors.ContractError)
    })
  })

  it('extra fields, passing', function() {
    expect(c.object({ x: c.value(5) })).to.passValue({ x: 5, y: 10 })
  })
  it('extra fields, wrapping', function() {
    expect(
      c.object({ fn: c.fn() }).wrap({ fn: function() {}, x: 5 })
    ).to.include({ x: 5 })
  })

  it('wrap wraps fields and fails', function() {
    const x = { thk: function() {} }
    expect(() =>
      c
        .object({ thk: c.fn() })
        .wrap(x)
        .thk(5)
    ).to.throw(errors.ContractError, /Wrong number/)
  })

  it('wrap maintains prototypes', function() {
    const x = { thk() {} }
    Object.getPrototypeOf(x).x = 5
    expect(Object.getPrototypeOf(c.object({ thk: c.fn() }).wrap(x))).to.include(
      {
        x: 5,
      }
    )
  })

  it('extends passes', function() {
    expect(c.object({ x: c.number }).extend({ y: c.string })).to.passValue({
      x: 5,
      y: 'asd',
    })
  })
  it('extends fails', function() {
    expect(() =>
      c
        .object({ x: c.number })
        .extend({ y: c.string })
        .check({ x: 5 })
    ).to.throw(errors.ContractError)
  })
})

describe('strict', function() {
  it('passes a good object', function() {
    expect(c.object({ x: c.value(10) }).strict()).to.passValue({ x: 10 })
  })
  it('passes a good tuple', function() {
    expect(c.tuple(c.value(10)).strict()).to.passValue([10])
  })
  it('passes double strict on a good object', function() {
    expect(
      c
        .object({ x: c.value(10) })
        .strict()
        .strict()
    ).to.passValue({ x: 10 })
  })
  it('passes double strict on a good tuple', function() {
    expect(
      c
        .tuple(c.value(10))
        .strict()
        .strict()
    ).to.passValue([10])
  })
  it('fails an object', function() {
    expect(() =>
      c
        .object({ x: c.value(10) })
        .strict()
        .check({ x: 10, y: 20 })
    ).to.throw(errors.ContractError)
  })
  it("fails an object's field", function() {
    expect(() =>
      c
        .object({ x: c.value(10) })
        .strict()
        .check({ x: 20 })
    ).to.throw(errors.ContractError)
  })
  it('fails an object, multiple', function() {
    expect(() =>
      c
        .object({ x: c.value(10) })
        .strict()
        .check({ x: 10, y: 20, z: 30 })
    ).to.throw(errors.ContractError)
  })
  it('fails a nested object', function() {
    expect(() =>
      c
        .object({ x: c.object({ y: c.value(10) }).strict() })
        .strict()
        .check({ x: { y: 10, z: 20 } })
    ).to.throw(errors.ContractError)
  })
  it('fails a tuple', function() {
    expect(() =>
      c
        .tuple(c.value(10))
        .strict()
        .check([10, 20])
    ).to.throw(errors.ContractError)
  })

  it('composes with extend', function() {
    expect(() =>
      c
        .object({ x: c.number })
        .strict()
        .extend({ y: c.number })
        .check({ x: 5 })
    ).to.throw(errors.ContractError, /required/)
    expect(() =>
      c
        .object({ x: c.number })
        .strict()
        .extend({ y: c.number })
        .check({ x: 5, y: 'asd' })
    ).to.throw(errors.ContractError)
    expect(
      c
        .object({ x: c.number })
        .strict()
        .extend({ y: c.number })
    ).to.passValue({ x: 5, y: 6 })
    expect(() =>
      c
        .object({ x: c.number })
        .strict()
        .extend({ y: c.number })
        .check({ x: 5, y: 6, z: 7 })
    ).to.throw(errors.ContractError, /extra field/)
    expect(() =>
      c
        .object({ x: c.number })
        .extend({ y: c.number })
        .strict()
        .check({ x: 5 })
    ).to.throw(errors.ContractError, /required/)
    expect(() =>
      c
        .object({ x: c.number })
        .extend({ y: c.number })
        .strict()
        .check({ x: 5, y: 'asd' })
    ).to.throw(errors.ContractError)
    expect(
      c
        .object({ x: c.number })
        .extend({ y: c.number })
        .strict()
    ).to.passValue({ x: 5, y: 6 })
    expect(() =>
      c
        .object({ x: c.number })
        .extend({ y: c.number })
        .strict()
        .check({ x: 5, y: 6, z: 7 })
    ).to.throw(errors.ContractError, /extra field/)
  })
})

describe('constructs', function() {
  function ExampleImpl(x) {
    this.x = x
  }
  ExampleImpl.prototype.inc = function(i) {
    this.x += i
  }
  ExampleImpl.prototype._dec = function(i) {
    this.x -= i
  }

  const Example = c
    .fun({ x: c.number })
    .constructs({
      inc: c.fun({ i: c.number }),
    })
    .wrap(ExampleImpl)

  it('creates a wrapped object', function() {
    const instance = new Example(5)
    expect(instance).to.include({ x: 5 })
    instance.inc(2)
    expect(instance).to.include({ x: 7 })
    expect(instance.constructor).to.equal(ExampleImpl)
  })

  it('refuses wrong constructor arguments', function() {
    expect(() => new Example('boom')).to.throw(
      errors.ContractError,
      /ExampleImpl[\s\S]+argument/
    )
  })

  it('refuses incorrectly constructed objects', function() {
    const Wrap = c
      .fun({ x: c.number })
      .constructs({})
      .returns(c.object({ x: c.string }))
      .wrap(ExampleImpl)
    expect(() => new Wrap(4)).to.throw(
      errors.ContractError,
      /ExampleImpl[\s\S]+ string, but got 4/
    )
  })

  it('produces an object that fails on bad input', function() {
    expect(() => new Example(5).inc('five')).to.throw(
      errors.ContractError,
      /inc()[\s\S]+number/
    )
  })

  it('fields omitted from the contract can be used normally', function() {
    const w = new Example(4)
    w._dec('twenty')
    expect(isNaN(w.x)).to.be.true
  })

  it('detects missing fields', function() {
    expect(() =>
      c
        .fun()
        .constructs({
          inc: c.fun({ i: c.number }),
          _dec: c.fun({ i: c.number }),
        })
        .wrap(function Blank() {})
    ).to.throw(errors.ContractError, /are missing[\s\S]+inc, _dec/)
  })

  it('detects inherited fields', function() {
    function ChildExampleImpl(x) {
      ExampleImpl.call(this, x)
    }
    ChildExampleImpl.prototype = Object.create(ExampleImpl.prototype)

    expect(
      c
        .fun({ x: c.number })
        .constructs({
          inc: c.fun({ i: c.number }),
          _dec: c.fun({ i: c.number }),
        })
        .wrap(ChildExampleImpl)
    ).to.be.ok
  })

  it('allows `instanceof` and `isA` checks on the wrapped constructor', function() {
    const instance = new Example(5)
    expect(instance).to.be.an.instanceof(Example)
    expect(c.isA(Example)).to.passValue(instance)
  })

  it('allows `instanceof` and `isA` checks on the implementation', function() {
    const instance = new Example(5)
    expect(instance).to.be.an.instanceof(ExampleImpl)
    expect(c.isA(ExampleImpl)).to.passValue(instance)
  })

  it('supports returning explicitly', function() {
    let theReturnValue = { x: 5 }
    const Constructor = function() {
      this.x = 1
      return theReturnValue
    }
    const Wrapped = c
      .fun()
      .returns(c.object({ x: c.number }))
      .constructs({})
      .wrap(Constructor)
    expect(new Wrapped()).to.include({ x: 5 })
    theReturnValue = undefined
    expect(new Wrapped()).to.include({ x: 1 })
    theReturnValue = 'foo'
    expect(new Wrapped()).to.include({ x: 1 })
    theReturnValue = 5
    expect(new Wrapped()).to.include({ x: 1 })
  })

  describe('in the presence of the prototype chain', function() {
    function SubExampleImpl(x) {
      ExampleImpl.call(this, x)
    }
    SubExampleImpl.prototype = Object.create(Example.prototype)
    SubExampleImpl.prototype.pair = function(n) {
      return [this.x, this.x]
    }
    SubExampleImpl.prototype.reset = function() {
      this.x = 0
    }

    const SubExample = c
      .fun({ i: c.number })
      .constructs({
        pair: c.fun().returns(c.array(c.number)),
      })
      .wrap(SubExampleImpl)

    it('produces a usable object with shared methods', function() {
      const instance = new SubExample(10)
      expect(instance).to.have.property('pair')
      expect(instance.hasOwnProperty('pair')).to.be.false
      expect(instance).to.have.property('inc')
      expect(instance.hasOwnProperty('inc')).to.be.false
      expect(instance.pair()).to.deep.equal([10, 10])
    })
    it('allows use of methods from up the chain', function() {
      const instance = new SubExample(10)
      instance.inc(2)
      expect(instance).to.include({ x: 12 })
    })
    it('it detects misuses of methods from up the chain', function() {
      const instance = new SubExample(10)
      expect(() => instance.inc('nope')).to.throw(
        errors.ContractError,
        /number.*nope/
      )
      expect(() => instance.pair(20)).to.throw(
        errors.ContractError,
        /Wrong number of arg/
      )
    })
    it('methods up the chain omitted from the contract can be used normally', function() {
      const instance = new SubExample(10)
      instance._dec(3)
      expect(instance).to.include({ x: 7 })
    })
    it('check `isA` for the `this` argument', function() {
      const instance = new SubExample(10)
      const incFn = instance.inc
      expect(() => incFn(20)).to.throw(
        errors.ContractError,
        /isA\(ExampleImpl\)[\s\S]+the `this` argument/
      )
      expect(() => incFn.call(new SubExample(5), 2, 4)).to.be.ok
      expect(() => incFn.call({}, 2)).to.throw(
        errors.ContractError,
        /the `this` argument/
      )
    })
    it('`isA` checks on subclass refuses superclass', function() {
      const instance = new SubExample(10)
      const pairFn = instance.pair
      expect(() => pairFn.call(new Example(5))).to.throw(
        errors.ContractError,
        /isA\(SubExampleImpl\)[\s\S]+`this`/
      )
    })
  })

  describe('when nested inside other contracts', function() {
    const theContract = c.fun(
      {
        x: c.object({
          BuildIt: c
            .fn()
            .constructs({
              inc: c.fun({ i: c.any }).returns(c.number),
            })
            .returns(c.object()),
        }),
      },
      { v: c.any }
    )

    const theFunction = function(x, v) {
      const instance = new x.BuildIt()
      return instance.inc(v)
    }

    const wrapped = theContract.wrap(theFunction)

    const TheConstructor = function() {}
    TheConstructor.prototype.inc = function(i) {
      return i + 1
    }

    const theObject = { BuildIt: TheConstructor }

    it('produces a usable object', function() {
      expect(wrapped(theObject, 10)).to.equal(11)
    })

    it('detects misuses', function() {
      expect(() => wrapped(theObject, 'ten')).to.throw(
        errors.ContractError,
        /inc[\s\S]+return value of the call/
      )
    })

    it('produces a short stack context on prototype function calls', function() {
      try {
        wrapped(theObject, 'ten')
      } catch (e) {
        expect(e.message).not.to.include('at position')
      }
    })
    it('the truncated context retains the original wrap location', function() {
      const index = fs
        .readFileSync('./src/contract.spec.js')
        .toString()
        .split('\n')
        .findIndex(line => line.match(/theContract.wrap\(theFunction\)/))
      const expected = new RegExp(
        `contract was wrapped at: .*/contract.spec.js:${index + 1}`
      )
      expect(() => wrapped(theObject, 'ten')).to.throw(
        errors.ContractError,
        expected
      )
    })
  })
})

describe('fn', function() {
  const id = function(x) {
    return x
  }
  const strId = function(x) {
    return `${x}`
  }
  const twoId = function(x, y) {
    return [x, y]
  }
  const manyId = function(/* ... */) {
    return arguments[0]
  }
  const thisId = function(x) {
    return this.x
  }

  const idC = c.fn(c.number).returns(c.number)
  const strIdC = c.fn(c.number).returns(c.string)
  const twoIdC = c.fn(c.number, c.string).returns(c.tuple(c.number, c.string))
  const manyIdC = c
    .fn()
    .extraArgs([c.number])
    .returns(c.number)
  const thisC = c
    .fn(c.number)
    .thisArg(c.object({ x: c.string }))
    .returns(c.string)

  const oneOptC = c.fn(c.number, c.optional(c.number))

  it('is a function', function() {
    expect(idC.wrap(id)).to.be.an.instanceof(Function)
  })
  it('passes id(number)', function() {
    expect(idC.wrap(id)(5)).to.equal(5)
  })
  it('passes strId(number)', function() {
    expect(strIdC.wrap(strId)(10)).to.equal('10')
  })
  it('passes twoId(number, string)', function() {
    expect(twoIdC.wrap(twoId)(5, 'x')).to.deep.equal([5, 'x'])
  })
  it('passes manyId(num, num, str)', function() {
    expect(manyIdC.wrap(manyId)(5, 7, 10)).to.equal(5)
  })

  it('fails on non-function', function() {
    expect(() => idC.wrap(5)).to.throw(errors.ContractError)
  })
  it('fails on wrong number of args', function() {
    expect(() => idC.wrap(id)(5, 6)).to.throw(errors.ContractError)
  })
  it('fails on input', function() {
    expect(() => idC.wrap(id)('boo')).to.throw(errors.ContractError)
  })
  it('fails on 2nd input', function() {
    expect(() => twoIdC.wrap(twoId)(5, 10)).to.throw(errors.ContractError)
  })
  it('fails on output', function() {
    expect(() => strIdC.wrap(id)(10)).to.throw(errors.ContractError)
  })
  it('fails on extra input', function() {
    expect(() => manyIdC.wrap(manyId)(5, 6, 'boo', 7)).to.throw(
      errors.ContractError
    )
  })
  it('fails on return when extra arguments', function() {
    expect(() => manyIdC.wrap(strId)(5, 6, 7)).to.throw(
      errors.ContractError,
      /for the return/
    )
  })

  it('success on this', function() {
    const v = { x: 'w', getX: thisC.wrap(thisId) }
    expect(v.getX(4)).to.equal('w')
  })
  it('fails on this', function() {
    const v = { x: 50, getX: thisC.wrap(thisId) }
    expect(() => v.getX(4)).to.throw(errors.ContractError, /this/)
  })

  it('passes w missing opt', function() {
    expect(oneOptC.wrap(twoId)(10)).to.deep.equal([10, undefined])
  })
  it('passes none missing', function() {
    expect(oneOptC.wrap(twoId)(10, 20)).to.deep.equal([10, 20])
  })
  it('passes with extra', function() {
    expect(oneOptC.extraArgs(c.any).wrap(twoId)(10, 20, 30)).to.deep.equal([
      10,
      20,
    ])
  })
  it('fails too few', function() {
    expect(() => oneOptC.wrap(twoId)()).to.throw(errors.ContractError, /few/)
  })
  it('fails too many', function() {
    expect(() => oneOptC.wrap(twoId)(10, 20, 30)).to.throw(
      errors.ContractError,
      /many/
    )
  })
})

describe('fun', function() {
  const id = function(x) {
    return x
  }
  const strId = function(x) {
    return `${x}`
  }
  const twoId = function(x, y) {
    return [x, y]
  }
  const manyId = function(/* ... */) {
    return arguments[0]
  }
  const thisId = function(x) {
    return this.x
  }

  const idC = c.fun({ the_arg: c.number }).returns(c.number)
  const strIdC = c.fun({ the_arg: c.number }).returns(c.string)
  const twoIdC = c
    .fun({ fstArg: c.number }, { sndArg: c.string })
    .returns(c.tuple(c.number, c.string))
  const manyIdC = c
    .fun()
    .extraArgs([c.number])
    .returns(c.number)
  const thisC = c
    .fun({ y: c.number })
    .thisArg(c.object({ x: c.string }))
    .returns(c.string)

  it('is a function', function() {
    expect(idC.wrap(id)).to.be.an.instanceof(Function)
  })
  it('passes id(number)', function() {
    expect(idC.wrap(id)(5)).to.equal(5)
  })
  it('passes strId(number)', function() {
    expect(strIdC.wrap(strId)(10)).to.equal('10')
  })
  it('passes twoId(number, string)', function() {
    expect(twoIdC.wrap(twoId)(5, 'x')).to.deep.equal([5, 'x'])
  })
  it('passes manyId(num, num, str)', function() {
    expect(manyIdC.wrap(manyId)(5, 7, 10)).to.equal(5)
  })

  it('fails on non-function', function() {
    expect(() => idC.wrap(5)).to.throw(errors.ContractError, /fun/)
  })
  it('fails on wrong number of args', function() {
    expect(() => idC.wrap(id)(5, 6)).to.throw(
      errors.ContractError,
      /Wrong number/
    )
  })
  it('fails on input', function() {
    expect(() => idC.wrap(id)('boo')).to.throw(errors.ContractError, /the_arg/)
  })
  it('fails on 2nd input', function() {
    expect(() => twoIdC.wrap(twoId)(5, 10)).to.throw(
      errors.ContractError,
      /sndArg/
    )
  })
  it('fails on output', function() {
    expect(() => strIdC.wrap(id)(10)).to.throw(
      errors.ContractError,
      /for the return/
    )
  })
  it('fails on extra input', function() {
    expect(() => manyIdC.wrap(manyId)(5, 6, 'boo', 7)).to.throw(
      errors.ContractError,
      /3rd extra argument/
    )
  })
  it('fails on return when extra arguments', function() {
    expect(() => manyIdC.wrap(strId)(5, 6, 7)).to.throw(
      errors.ContractError,
      /for the return/
    )
  })

  it('success on this', function() {
    const v = { x: 'w', getX: thisC.wrap(thisId, 'thisId') }
    expect(v.getX(4)).to.equal('w')
  })
  it('fails on this', function() {
    const v = { x: 50, getX: thisC.wrap(thisId) }
    expect(() => v.getX(5)).to.throw(errors.ContractError, /this/)
  })
})

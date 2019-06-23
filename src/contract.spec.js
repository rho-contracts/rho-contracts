'use strict'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { expect, Assertion } = require('chai')
const should = require('should')
const __ = require('underscore')
const c = require('./contract')
const fs = require('fs')
const errors = require('./contract-errors')

Assertion.addMethod('passValue', function(goodValue) {
  const obj = this._obj

  // first, our instanceof check, shortcut
  new Assertion(this._obj).to.be.instanceof(c.Contract)

  new Assertion(this._obj.check(goodValue)).to.equal(goodValue)
})

// eslint-disable-next-line no-extend-native
Array.prototype.toString = function() {
  return `[${this.join(', ')}]`
}

const oldToString = Object.prototype.toString
// eslint-disable-next-line no-extend-native
Object.prototype.toString = function() {
  const that = this
  if (__.isObject(that))
    return `{ ${__.chain(that)
      .keys()
      .map(function(k) {
        return `${k}: ${that[k]}`
      })
      .value()
      .join(', ')} }`
  else return oldToString.call(that)
}

should.Assertion.prototype.throwError = function(message) {
  this['throw'](message)
}

should.Assertion.prototype.throwContract = function(message) {
  this.throwType(errors.ContractError, message)
}

should.Assertion.prototype.throwType = function(type, message) {
  const fn = this.obj
  let err = {}
  let errorInfo = ''
  let caught
  let ok

  try {
    const v = fn()
    caught = false
    ok = false
    errorInfo = `but the function returned ${v}`
  } catch (e) {
    err = e
    caught = true
  }

  if (caught) {
    // console.log('\ncontracts/contract.spec.js Line 49:\n'+err+'\n'+err.renderedStack+'\n\n');
    if (err.name !== type.name) {
      ok = false
      errorInfo = `but the error was ${err}`
    } else if (!message) {
      ok = true
    } else if (typeof message === 'string') {
      ok = message === err.message
      errorInfo = `with a message exactly '${message}', but got '${err.message}'`
    } else if (message instanceof RegExp) {
      ok = message.test(err.message)
      errorInfo = `with a message matching ${message}', but got '${err.message}'`
    } else {
      throw new Error('should.throw expects a string or a regexp')
    }
  }

  this.assert(
    ok,
    function() {
      return `expected a ${type.name} to be thrown ${errorInfo}`
    },
    function() {
      return `expected no ${type.name} to be thrown, got "${err.message}"`
    }
  )

  return this
}

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
    ;(function() {
      kidPark.check(example)
    }.should.throwContract(/Expected string/))
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
    ;(function() {
      c.nothing.check(5)
    }.should.throwContract())
  })
  it('report check name', function() {
    ;(function() {
      c.nothing.wrap(5, 'test')
    }.should.throwContract(/test/))
  })
})

describe('value', function() {
  it('pass same', function() {
    expect(c.value(5)).to.passValue(5)
  })
  it('reject different', function() {
    ;(function() {
      c.value(5).check(6)
    }.should.throwContract())
  })
})

describe('string', function() {
  it('pass string', function() {
    expect(c.string).to.passValue('asd')
  })
  it('reject different', function() {
    ;(function() {
      c.string.check(6)
    }.should.throwContract())
  })
})

describe('Date', function() {
  it('pass Date', function() {
    expect(c.date).to.passValue(new Date())
  })
  it('reject different', function() {
    ;(function() {
      c.date.check(6)
    }.should.throwContract())
  })
})

describe('isA', function() {
  function ExampleImpl() {}
  it('detects a newly constructed object', function() {
    expect(c.isA(ExampleImpl)).to.passValue(new ExampleImpl())
  })

  it('rejects different', function() {
    ;(function() {
      c.isA(ExampleImpl).check(new Date())
    }.should.throwContract(/isA\(ExampleImpl\)/))
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
    ;(function() {
      c.and(c.string, c.value('asd')).check(5)
    }.should.throwContract())
  })
  it('fails second', function() {
    ;(function() {
      c.and(c.string, c.value('asd')).check('aaa')
    }.should.throwContract())
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
    ;(function() {
      c.or(c.string, c.value(6)).check(0)
    }.should.throwContract())
  })
  it('two fn cannot be wrapped', function() {
    ;(function() {
      c.or(c.fn(), c.fn()).wrap(function() {}, function() {})
    }.should.throwError(/at most one/))
  })
})

describe('matches', function() {
  it('passes', function() {
    expect(c.matches(/x+/)).to.passValue('---xxxxx  ')
  })
  it('fail', function() {
    ;(function() {
      c.matches(/x+/).check('---  ')
    }.should.throwContract())
  })
  it('does not coerce null', function() {
    ;(function() {
      c.matches(/null/).check(null)
    }.should.throwContract())
  })
})

describe('array', function() {
  it('fails non-arrays', function() {
    ;(function() {
      c.array(c.any).check(5)
    }.should.throwContract())
  })
  it('passes empty', function() {
    expect(c.array(c.any)).to.passValue([])
  })
  it('passes simple', function() {
    expect(c.array(c.value(5))).to.passValue([5, 5])
  })
  it('fails first', function() {
    ;(function() {
      c.array(c.value(5)).check([10, 5])
    }.should.throwContract())
  })
  it('fails second', function() {
    ;(function() {
      c.array(c.value(5)).check([5, 10])
    }.should.throwContract())
  })
  it('passes nested', function() {
    expect(c.array(c.array(c.value(5)))).to.passValue([[5], [5, 5]])
  })
  it('fails nested', function() {
    ;(function() {
      c.array(c.array(c.value(5))).check([[5], [5, 10]])
    }.should.throwContract())
  })
})

describe('tuple', function() {
  it('fails non-arrays', function() {
    ;(function() {
      c.tuple(c.any).check(5)
    }.should.throwContract())
  })
  it('fails empty', function() {
    ;(function() {
      c.tuple(c.any).check([])
    }.should.throwContract())
  })
  it('passes simple', function() {
    expect(c.tuple(c.value(5), c.value(10))).to.passValue([5, 10])
  })
  it('passes longer', function() {
    expect(c.tuple(c.value(5), c.value(10))).to.passValue([5, 10, 'x'])
  })
  it('fails first', function() {
    ;(function() {
      c.tuple(c.value(5), c.value(10)).check([10, 5])
    }.should.throwContract())
  })
  it('fails second', function() {
    ;(function() {
      c.tuple(c.value(5), c.value(10)).check([5, 20])
    }.should.throwContract())
  })
  it('passes nested', function() {
    expect(
      c.tuple(c.string, c.tuple(c.value(5), c.string), c.number)
    ).to.passValue(['a', [5, 'b'], 5])
  })
  it('fails nested', function() {
    ;(function() {
      c.tuple(c.string, c.tuple(c.value(5), c.string), c.number).check([
        'a',
        [5, 10],
        5,
      ])
    }.should.throwContract())
  })
})

describe('hash', function() {
  it('passes', function() {
    expect(c.hash(c.string)).to.passValue({ x: 'aaa', y: 'bbb' })
  })
  it('fails', function() {
    ;(function() {
      c.hash(c.string).check({ x: 'aaa', y: 5 })
    }.should.throwContract())
  })
  it('wrap wraps fields and fails', function() {
    ;(function() {
      const x = { thk: function() {} }
      c.hash(c.fn())
        .wrap(x)
        .thk(5)
    }.should.throwContract(/Wrong number/))
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
    ;(function() {
      c.object().check(5)
    }.should.throwContract())
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
    ;(function() {
      c.object({ x: c.value(5), y: c.value(10) }).check({ x: 10, y: 10 })
    }.should.throwContract())
  })
  it('fails second', function() {
    ;(function() {
      c.object({ x: c.value(5), y: c.value(10) }).check({ x: 5, y: 2 })
    }.should.throwContract())
  })
  it('passes nested', function() {
    const value = { x: { y: 5 } }
    expect(c.object({ x: c.object({ y: c.value(5) }) }).check(value)).to.equal(
      value
    )
  })
  it('fails nested', function() {
    ;(function() {
      c.object({ x: c.object({ y: c.value(5) }) }).check({ x: { y: 10 } })
    }.should.throwContract())
  })
  it('fails missing field', function() {
    ;(function() {
      c.object({ x: c.value(5), y: c.value(10) }).check({ x: 5, z: 10 })
    }.should.throwContract())
  })
  it('fails missing field, nested', function() {
    ;(function() {
      c.object({ x: c.object({ y: c.value(5) }) }).check({ x: { z: 10 } })
    }.should.throwContract())
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
      ;(function() {
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check({
          x: 5,
          y: 5,
        })
      }.should.throwContract())
    })
    it('rejects when falsy', function() {
      ;(function() {
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check({
          x: 5,
          y: '',
        })
      }.should.throwContract())
    })
    it('rejects when NaN', function() {
      ;(function() {
        c.object({ x: c.value(5), y: c.optional(c.value(10)) }).check({
          x: 5,
          y: 0 / 0,
        })
      }.should.throwContract())
    })
    it('nested and mismatched', function() {
      ;(function() {
        c.object({
          x: c.value(5),
          y: c.optional(c.object({ z: c.value(10) })),
        }).check({ x: 5, y: { z: 0 } })
      }.should.throwContract())
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
    ;(function() {
      const x = { thk: function() {} }
      c.object({ thk: c.fn() })
        .wrap(x)
        .thk(5)
    }.should.throwContract(/Wrong number/))
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
    ;(function() {
      c.object({ x: c.number })
        .extend({ y: c.string })
        .check({ x: 5 })
    }.should.throwContract())
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
    ;(function() {
      c.object({ x: c.value(10) })
        .strict()
        .check({ x: 10, y: 20 })
    }.should.throwContract())
  })
  it("fails an object's field", function() {
    ;(function() {
      c.object({ x: c.value(10) })
        .strict()
        .check({ x: 20 })
    }.should.throwContract())
  })
  it('fails an object, multiple', function() {
    ;(function() {
      c.object({ x: c.value(10) })
        .strict()
        .check({ x: 10, y: 20, z: 30 })
    }.should.throwContract())
  })
  it('fails a nested object', function() {
    ;(function() {
      c.object({ x: c.object({ y: c.value(10) }).strict() })
        .strict()
        .check({ x: { y: 10, z: 20 } })
    }.should.throwContract())
  })
  it('fails a tuple', function() {
    ;(function() {
      c.tuple(c.value(10))
        .strict()
        .check([10, 20])
    }.should.throwContract())
  })

  it('composes with extend', function() {
    ;(function() {
      c.object({ x: c.number })
        .strict()
        .extend({ y: c.number })
        .check({ x: 5 })
    }.should.throwContract(/required/))
    ;(function() {
      c.object({ x: c.number })
        .strict()
        .extend({ y: c.number })
        .check({ x: 5, y: 'asd' })
    }.should.throwContract())
    ;(function() {
      c.object({ x: c.number })
        .strict()
        .extend({ y: c.number })
        .check({ x: 5, y: 6 })
    }.should.ok)
    ;(function() {
      c.object({ x: c.number })
        .strict()
        .extend({ y: c.number })
        .check({ x: 5, y: 6, z: 7 })
    }.should.throwContract(/extra field/))
    ;(function() {
      c.object({ x: c.number })
        .extend({ y: c.number })
        .strict()
        .check({ x: 5 })
    }.should.throwContract(/required/))
    ;(function() {
      c.object({ x: c.number })
        .extend({ y: c.number })
        .strict()
        .check({ x: 5, y: 'asd' })
    }.should.throwContract())
    ;(function() {
      c.object({ x: c.number })
        .extend({ y: c.number })
        .strict()
        .check({ x: 5, y: 6 })
    }.should.ok)
    ;(function() {
      c.object({ x: c.number })
        .extend({ y: c.number })
        .strict()
        .check({ x: 5, y: 6, z: 7 })
    }.should.throwContract(/extra field/))
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
    ;(function() {
      new Example('boom')
    }.should.throwContract(/ExampleImpl[\s\S]+argument/))
  })

  it('refuses incorrectly constructed objects', function() {
    const Wrap = c
      .fun({ x: c.number })
      .constructs({})
      .returns(c.object({ x: c.string }))
      .wrap(ExampleImpl)
    ;(function() {
      new Wrap(4)
    }.should.throwContract(/ExampleImpl[\s\S]+ string, but got 4/))
  })

  it('produces an object that fails on bad input', function() {
    ;(function() {
      new Example(5).inc('five')
    }.should.throwContract(/inc()[\s\S]+number/))
  })

  it('fields omitted from the contract can be used normally', function() {
    const w = new Example(4)
    w._dec('twenty')
    expect(isNaN(w.x)).to.be.true
  })

  it('detects missing fields', function() {
    ;(function() {
      c.fun()
        .constructs({
          inc: c.fun({ i: c.number }),
          _dec: c.fun({ i: c.number }),
        })
        .wrap(function Blank() {})
    }.should.throwContract(/are missing[\s\S]+inc, _dec/))
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
      instance.should.not.have.ownProperty('pair')
      expect(instance).to.have.property('inc')
      instance.should.not.have.ownProperty('inc')
      expect(instance.pair()).to.deep.equal([10, 10])
    })
    it('allows use of methods from up the chain', function() {
      const instance = new SubExample(10)
      instance.inc(2)
      expect(instance).to.include({ x: 12 })
    })
    it('it detects misuses of methods from up the chain', function() {
      const instance = new SubExample(10)
      ;(function() {
        instance.inc('nope')
      }.should.throwContract(/number.*nope/))
      ;(function() {
        instance.pair(20)
      }.should.throwContract(/Wrong number of arg/))
    })
    it('methods up the chain omitted from the contract can be used normally', function() {
      const instance = new SubExample(10)
      instance._dec(3)
      expect(instance).to.include({ x: 7 })
    })
    it('check `isA` for the `this` argument', function() {
      const instance = new SubExample(10)
      const incFn = instance.inc
      ;(function() {
        incFn(20)
      }.should.throwContract(/isA\(ExampleImpl\)[\s\S]+the `this` argument/))
      ;(function() {
        incFn.call(new SubExample(5), 2, 4)
      }.should.ok)
      ;(function() {
        incFn.call({}, 2)
      }.should.throwContract(/the `this` argument/))
    })
    it('`isA` checks on subclass refuses superclass', function() {
      const instance = new SubExample(10)
      const pairFn = instance.pair
      ;(function() {
        pairFn.call(new Example(5))
      }.should.throwContract(/isA\(SubExampleImpl\)[\s\S]+`this`/))
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
      ;(function() {
        wrapped(theObject, 'ten')
      }.should.throwContract(/inc[\s\S]+return value of the call/))
    })

    it('produces a short stack context on prototype function calls', function() {
      try {
        wrapped(theObject, 'ten')
      } catch (e) {
        e.message.should.not.match(/at position/)
      }
    })
    it('the truncated context retains the original wrap location', function() {
      const index = __.findIndex(
        fs
          .readFileSync('./src/contract.spec.js')
          .toString()
          .split('\n'),
        function(line) {
          return line.match(/theContract.wrap\(theFunction\)/)
        }
      )
      const expected = new RegExp(
        `contract was wrapped at: .*/contract.spec.js:${index + 1}`
      )
      ;(function() {
        wrapped(theObject, 'ten')
      }.should.throwContract(expected))
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
    ;(function() {
      idC.wrap(5)
    }.should.throwContract())
  })
  it('fails on wrong number of args', function() {
    ;(function() {
      idC.wrap(id)(5, 6)
    }.should.throwContract())
  })
  it('fails on input', function() {
    ;(function() {
      idC.wrap(id)('boo')
    }.should.throwContract())
  })
  it('fails on 2nd input', function() {
    ;(function() {
      twoIdC.wrap(twoId)(5, 10)
    }.should.throwContract())
  })
  it('fails on output', function() {
    ;(function() {
      strIdC.wrap(id)(10)
    }.should.throwContract())
  })
  it('fails on extra input', function() {
    ;(function() {
      manyIdC.wrap(manyId)(5, 6, 'boo', 7)
    }.should.throwContract())
  })
  it('fails on return when extra arguments', function() {
    ;(function() {
      manyIdC.wrap(strId)(5, 6, 7)
    }.should.throwContract(/for the return/))
  })

  it('success on this', function() {
    const v = { x: 'w', getX: thisC.wrap(thisId) }
    expect(v.getX(4)).to.equal('w')
  })
  it('fails on this', function() {
    ;(function() {
      const v = { x: 50, getX: thisC.wrap(thisId) }
      v.getX(4)
    }.should.throwContract(/this/))
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
    ;(function() {
      oneOptC.wrap(twoId)()
    }.should.throwContract(/few/))
  })
  it('fails too many', function() {
    ;(function() {
      oneOptC.wrap(twoId)(10, 20, 30)
    }.should.throwContract(/many/))
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
    ;(function() {
      idC.wrap(5)
    }.should.throwContract(/fun/))
  })
  it('fails on wrong number of args', function() {
    ;(function() {
      idC.wrap(id)(5, 6)
    }.should.throwContract(/Wrong number/))
  })
  it('fails on input', function() {
    ;(function() {
      idC.wrap(id)('boo')
    }.should.throwContract(/the_arg/))
  })
  it('fails on 2nd input', function() {
    ;(function() {
      twoIdC.wrap(twoId)(5, 10)
    }.should.throwContract(/sndArg/))
  })
  it('fails on output', function() {
    ;(function() {
      strIdC.wrap(id)(10)
    }.should.throwContract(/for the return/))
  })
  it('fails on extra input', function() {
    ;(function() {
      manyIdC.wrap(manyId)(5, 6, 'boo', 7)
    }.should.throwContract(/3rd extra argument/))
  })
  it('fails on return when extra arguments', function() {
    ;(function() {
      manyIdC.wrap(strId)(5, 6, 7)
    }.should.throwContract(/for the return/))
  })

  it('success on this', function() {
    const v = { x: 'w', getX: thisC.wrap(thisId, 'thisId') }
    expect(v.getX(4)).to.equal('w')
  })
  it('fails on this', function() {
    ;(function() {
      const v = { x: 50, getX: thisC.wrap(thisId) }
      v.getX(5)
    }.should.throwContract(/this/))
  })
})

'use strict'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const u = require('./utils')
const _ = require('underscore')
const errors = require('./contract-errors')

exports.privates = {}

// Throughout this file, `var self = this` indicates that the function is
// intended to be called (and thought of) as a method (regardless of whether
// `self` is actually used within the body of the function.

// Without `Error.stackTraceLimit = Infinity;`, often no stack trace is printed at all. By default, node records only 10 stack
// frames, and since the contract checking is done recursively, easily the first 10 frames are inside the contract
// library --and those frames are not printed since they are not interesting.

Error.stackTraceLimit = Infinity

exports.setErrorMessageInspectionDepth = u.setErrorMessageInspectionDepth

// --
//
// Basic recursive checking with path tracking
//

function checkWContext(contract, data, context) {
  if (contract.isOptional && u.isMissing(data)) {
    // ok
  } else {
    if (!contract.firstChecker(data)) {
      context.fail(
        new errors.ContractError(context)
          .expected(contract.contractName, data)
          .fullContractAndValue()
      )
    }
    if (contract.needsWrapping && !context.wrapping) {
      throw new errors.ContractLibraryError(
        'check',
        context,
        'This contract requires wrapping. Call wrap() instead and retain the wrapped result.'
      ).fullContract()
    }

    contract.nestedChecker(
      data,
      function(nextContract, nextV, nextContext) {
        if (nextContext !== errors.stackContextItems.silent) {
          context.stack.push(nextContext)
        }
        checkWContext(_autoToContract(nextContract), nextV, context)
        if (nextContext !== errors.stackContextItems.silent) {
          context.stack.pop()
        }
      },
      context
    )
  }
}

function wrapWContext(contract, data, context) {
  if (contract.isOptional && u.isMissing(data)) {
    return data
  } else {
    return contract.wrapper(
      data,
      function(nextContract, nextV, nextContext) {
        if (nextContext !== errors.stackContextItems.silent) {
          context.stack.push(nextContext)
        }
        const c = _autoToContract(nextContract)
        const subWrap = !c.needsWrapping
          ? nextV
          : wrapWContext(c, nextV, context)
        if (nextContext !== errors.stackContextItems.silent) {
          context.stack.pop()
        }
        return subWrap
      },
      context
    )
  }
}

function checkWrapWContext(contract, data, context) {
  const c = _autoToContract(contract)
  checkWContext(c, data, context)
  if (!contract.needsWrapping) return data
  else {
    if (!context.wrappedAt) {
      context.wrappedAt = errors.captureCleanStack()
    }
    return wrapWContext(c, data, context)
  }
}
exports.privates.checkWrapWContext = checkWrapWContext

function newContext(thingName, data, contract, wrapping) {
  return {
    thingName,
    blameMe: true,
    data,
    stack: [],
    fail: function(e) {
      e.captureCleanStack()
      throw e
    },
    contract,
    wrapping,
  }
}

// --
//
// Base class for contracts
//

// State for the documentation mechanisms:
const builtInContractNames = new Set()
let collectingBuiltInContractNames = true
let currentCategory = false

function Contract(
  name, // name: the name of the contract as it should appear in the error messages
  spec
) {
  this.contractName = name
  if (collectingBuiltInContractNames) {
    builtInContractNames.add(name)
  }
  Object.assign(this, spec)
}
exports.privates.Contract = Contract

Contract.prototype = {
  signal: u.contractSignal,
  theDoc: [],
  category: false,
  needsWrapping: false,
  location: false,
  thingName: false, // thingName: Only used for generating documentation,
  // and for passing as the `name` argument of `check`.
  isOptional: false,

  needsWrappingIfAny: function(contracts) {
    const self = this
    if (contracts.map(_autoToContract).some(c => c.needsWrapping)) {
      self.needsWrapping = true
    }
  },

  firstChecker: function(data) {
    return true
  },
  nestedChecker: function(data, next) {},
  wrapper: function(data, next, context) {
    throw new errors.ContractLibraryError(
      wrap,
      context,
      'called on a contract that does not implements wrapping'
    ).fullContract()
  },
  check: function(data, /* opt */ name) {
    const self = this
    checkWContext(
      this,
      data,
      newContext(name || self.thingName, data, this, false)
    )
    return data
  },
  wrap: function(data, name) {
    const self = this
    const context = newContext(name || self.thingName, data, this, true)
    return checkWrapWContext(this, data, context)
  },
  toString: function() {
    const self = this
    return `c.${self.contractName}(${self.subToString().join(', ')})`
  },
  subToString: function() {
    return []
  },
  rename: function(name) {
    if (collectingBuiltInContractNames) {
      builtInContractNames.add(name)
    }
    return u.gentleUpdate(this, {
      contractName: name,
      toString: function() {
        return `c.${name}`
      },
    })
  },

  optional: function() {
    const self = this
    const oldToString = self.toString
    return u.gentleUpdate(this, {
      isOptional: true,
      toString: function() {
        const self = this
        return `c.optional(${oldToString.call(self)})`
      },
    })
  },

  doc: function(/* ... */) {
    return u.gentleUpdate(this, {
      theDoc: Array.from(arguments),
      category: currentCategory,
    })
  },
}

exports.Contract = Contract

// --
//
// Elementary contract functions
//

function _toContract(v, upgradeObjects) {
  if (u.isContractInstance(v)) {
    return v
  } else if (_.isArray(v)) {
    if (_.isUndefined(v[0]))
      throw new errors.ContractLibraryError(
        'toContract',
        false,
        `the example element of the array is missing. ${v}`
      )
    if (v.length > 1)
      throw new errors.ContractLibraryError(
        'toContract',
        false,
        `the given array has more than one element: ${v}`
      )
    return array(_toContract(v[0], upgradeObjects))
  } else if (!_.isObject(v) && !_.isFunction(v)) {
    return value(v)
  } else if (_.isObject(v) && upgradeObjects) {
    return object(_.mapObject(v, _.partial(_toContract, _, true)))
  } else
    throw new errors.ContractLibraryError(
      'toContract',
      false,
      `Cannot promote ${u.stringify(v)} to a contract`
    )
}

function _autoToContract(v) {
  return _toContract(v, false)
}
exports.privates._autoToContract = _autoToContract

exports.toContract = function(v) {
  return _toContract(v, true)
}

function check(contract, data, /* opt */ name) {
  _autoToContract(contract).check(data, name)
  return data
}
exports.check = check

function wrap(contract, data, name) {
  return _autoToContract(contract).wrap(data, name)
}
exports.wrap = wrap

function optional(contract) {
  return contract.optional()
}
exports.optional = optional

const any = new Contract('any')
exports.any = any

function pred(fn) {
  return new Contract('unamed-pred', { firstChecker: fn })
}
exports.pred = pred

const nothing = pred(function(data) {
  return false
}).rename('nothing')
exports.nothing = nothing

/*
function not(c) { return

*/
const falsy = pred(function(data) {
  return !data
}).rename('falsy')
exports.falsy = falsy

const truthy = pred(function(data) {
  return !!data
}).rename('truthy')
exports.truthy = truthy

function oneOf(/* ... */) {
  return new Contract(`oneOf(${Array.from(arguments).join(', ')})`, {
    firstChecker: function(vv) {
      const self = this
      return _.contains(self.values, vv)
    },
    values: Array.from(arguments),
    toString: function() {
      const self = this
      return `c.${self.contractName}`
    },
  })
}
exports.oneOf = oneOf

function value(v) {
  return oneOf(v).rename(`value(${v})`)
}
exports.value = value

const string = pred(_.isString).rename('string')
exports.string = string

const number = pred(_.isNumber).rename('number')
exports.number = number

const integer = pred(function(v) {
  return Math.floor(v) === v
}).rename('integer')
exports.integer = integer

const bool = pred(_.isBoolean).rename('bool')
exports.bool = bool

const regexp = pred(_.isRegExp).rename('regexp')
exports.regexp = regexp

const date = pred(_.isDate).rename('Date')
exports.date = date

const anyFunction = pred(_.isFunction).rename('fun(...)')
exports.anyFunction = anyFunction

const isA = function(parent) {
  const name = u.functionName(parent) || '...'
  return pred(function(v) {
    return v instanceof parent
  }).rename(`isA(${name})`)
}
exports.isA = isA

const error = isA(Error).rename('error')
exports.error = error

const contract = pred(function(v) {
  return u.isContractInstance(v) || _.isArray(v) || !_.isObject(v)
}).rename('contract')
exports.contract = contract

const quacksLike = function(parent, name) {
  return fromExample(parent).rename(`quacksLike(${name || '...'})`)
}
exports.quacksLike = quacksLike

// --
//
// Contract combiners
//

function checkMany(silent, contracts, data, next) {
  _(contracts).each(function(c, i) {
    if (silent) next(c, data, errors.stackContextItems.silent)
    else next(c, data, errors.stackContextItems.and(i))
  })
}

function makeAnd(silent) {
  return function(/* ... */) {
    const self = new Contract('and')
    self.contracts = Array.from(arguments)
    self.nestedChecker = function(data, next) {
      const self = this
      checkMany(silent, self.contracts, data, next)
    }
    self.wrapper = function(data, next, context) {
      throw new errors.ContractLibraryError(
        'wrap',
        context,
        'Cannot wrap an `and` contract'
      ).fullContract()
    }
    self.needsWrappingIfAny(self.contracts)
    self.subToString = function() {
      const self = this
      return self.contracts
    }
    return self
  }
}
const silentAnd = makeAnd(true)
const and = makeAnd(false)
exports.silentAnd = silentAnd
exports.and = and

function matches(r) {
  const name = `matches(${r})`
  return pred(function(v) {
    return _.isString(v) && r.test(v)
  }).rename(name)
}
exports.matches = matches

function or(/* ... */) {
  const self = new Contract('or')

  const allContracts = Array.from(arguments)
  self.contracts = allContracts.filter(c => !c.needsWrapping)
  self.wrappingContracts = allContracts.filter(c => c.needsWrapping)

  if (self.wrappingContracts.length > 1)
    throw new errors.ContractLibraryError(
      'or',
      false,
      `Or-contracts can only take at most one wrapping contracts, got ${self.wrappingContracts}`
    )

  self.nestedChecker = function(data, next, context) {
    const self = this
    const exceptions = []

    const oldFail = context.fail
    let success = false

    _(allContracts).each(function(contract) {
      let failed = false
      if (!success) {
        context.fail = function(e) {
          exceptions.push({ c: contract, e })
          failed = true
        }
        next(contract, data, errors.stackContextItems.silent)
        if (!failed) success = contract
      }
    })
    context.fail = oldFail

    if (!success) {
      const msg = `none of the contracts passed:\n${_(allContracts)
        .map(function(c) {
          return ` - ${c.toString()}`
        })
        .join('\n')}\n\nThe failures were:\n${_(exceptions)
        .map(function(contractError, i) {
          return `[${i +
            1}] --\n${contractError.c.toString()}: ${contractError.e.message}`
        })
        .join('\n\n')}\n`

      context.fail(
        new errors.ContractError(context, msg).fullContractAndValue(context)
      )
    }
    return success // return the successful contract to self.wrapper
  }
  self.wrapper = function(data, next, context) {
    const self = this
    const c = self.nestedChecker(data, function() {}, context) // this is a bit of a hack.
    return next(c, data, errors.stackContextItems.or)
  }
  self.needsWrappingIfAny(allContracts)
  return self
}
exports.or = or

function cyclic(/* opt */ needsWrapping) {
  const self = new Contract('cyclic')
  self.needsWrapping = !!_.isUndefined(needsWrapping)
  self.closeCycle = function(c) {
    const self = this
    if (self.needsWrapping !== c.needsWrapping)
      throw new errors.ContractLibraryError(
        self.contractName,
        false,
        `A ${self.contractName}() was started with needsWrapping=${self.needsWrapping}, but it was closed with a contract that has needsWrapping=${c.needsWrapping}:\n${c}`
      )

    _.each(c, function(v, k) {
      self[k] = v
    })
    return self
  }
  return self
}
exports.cyclic = cyclic

function forwardRef(/* opt */ needsWrapping) {
  const result = cyclic(!_.isUndefined(needsWrapping)).rename('forwardRef')
  result.setRef = result.closeCycle
  delete result.closeCycle
  return result
}
exports.forwardRef = forwardRef

// --
//
// Data structure contracts
//

function array(itemContract) {
  const self = new Contract('array')
  self.itemContract = itemContract
  self.firstChecker = _.isArray
  self.nestedChecker = function(data, next) {
    const self = this
    data.forEach((item, i) => {
      next(self.itemContract, item, errors.stackContextItems.arrayItem(i))
    })
  }
  self.wrapper = function(data, next) {
    const self = this
    const result = data.map((item, i) =>
      next(self.itemContract, item, errors.stackContextItems.arrayItem(i))
    )
    return result
  }
  self.needsWrappingIfAny([itemContract])
  self.subToString = function() {
    const self = this
    return [self.itemContract]
  }
  return self
}
exports.array = array

function tuple(/* ... */) {
  const self = new Contract('tuple')
  self.contracts = Array.from(arguments)
  self.firstChecker = _.isArray
  self.nestedChecker = function(data, next, context) {
    const self = this
    if (data.length < self.contracts.length) {
      context.fail(
        new errors.ContractError(context).expected(
          `tuple of size ${self.contracts.length}`,
          data
        )
      )
    }

    _.zip(self.contracts, data.slice(0, self.contracts.length)).forEach(
      function(pair, i) {
        next(pair[0], pair[1], errors.stackContextItems.tupleItem(i))
      }
    )
  }
  self.wrapper = function(data, next) {
    const self = this
    return _.zip(self.contracts, data.slice(0, self.contracts.length)).map(
      (pair, i) => next(pair[0], pair[1], errors.stackContextItems.tupleItem(i))
    )
  }

  self.strict = function() {
    const self = this
    const oldNestedChecker = self.nestedChecker
    const result = u.gentleUpdate(self, {
      nestedChecker: function(data, next, context) {
        const self = this
        if (data.length !== self.contracts.length) {
          context.fail(
            new errors.ContractError(context)
              .expected(`tuple of exactly size ${_.size(self.contracts)}`, data)
              .fullContractAndValue()
          )
        }
        return oldNestedChecker.call(self, data, next, context)
      },

      strict: function() {
        const self = this
        return self
      },
    })

    return result.rename('tuple.strict')
  }

  self.needsWrappingIfAny(self.contracts)
  self.subToString = function() {
    const self = this
    return self.contracts
  }
  return self
}
exports.tuple = tuple

function hash(valueContract) {
  const self = new Contract('hash')
  self.valueContract = valueContract
  self.firstChecker = function(v) {
    return _.isObject(v) && !u.isContractInstance(v)
  }
  self.nestedChecker = function(data, next, context) {
    const self = this
    _.each(data, function(v, k) {
      next(self.valueContract, v, errors.stackContextItems.hashItem(k))
    })
  }
  self.wrapper = function(data, next, context) {
    const self = this
    const result = u.clone(data)
    _.each(result, function(v, k) {
      result[k] = next(
        self.valueContract,
        v,
        errors.stackContextItems.hashItem(k)
      )
    })
    return result
  }
  self.needsWrappingIfAny([self.valueContract])
  self.subToString = function() {
    const self = this
    return [self.valueContract]
  }
  return self
}
exports.hash = hash

function object(/* opt */ fieldContracts) {
  const self = new Contract('object')
  self.fieldContracts = {}
  _.each(fieldContracts, function(c, k) {
    self.fieldContracts[k] = _autoToContract(c)
  })

  self.firstChecker = _.isObject
  self.nestedChecker = function(data, next, context) {
    const self = this

    _(self.fieldContracts).each(function(contract, field) {
      if (!contract.isOptional && u.isMissing(data[field])) {
        context.fail(
          new errors.ContractError(
            context,
            `Field \`${field}\` required, got ${u.stringify(data)}`
          ).fullContractAndValue()
        )
      }
      if (!u.isMissing(data[field]))
        next(contract, data[field], errors.stackContextItems.objectField(field))
    })
  }
  self.wrapper = function(data, next) {
    const self = this
    const result = u.clone(data)

    _(self.fieldContracts).each(function(contract, field) {
      if (contract.needsWrapping) {
        result[field] = next(
          u.gentleUpdate(contract, { thingName: field }),
          data[field],
          errors.stackContextItems.objectField(field)
        )
      }
    })

    return result
  }

  self.extend = function(newFields) {
    const self = this
    // const oldToString = self.toString
    return u.gentleUpdate(self, {
      fieldContracts: u.gentleUpdate(self.fieldContracts, newFields),
    }) // TODO: toString when being renamed
  }

  self.strict = function() {
    const self = this
    const oldNestedChecker = self.nestedChecker
    const result = u.gentleUpdate(self, {
      nestedChecker: function(data, next, context) {
        const self = this
        const extra = _.difference(_.keys(data), _.keys(self.fieldContracts))
        if (extra.length > 0) {
          const extraStr = extra.map(k => `\`${k}\``).join(', ')

          context.fail(
            new errors.ContractError(
              context,
              `Found the extra field${
                _.size(extra) === 1 ? ' ' : 's '
              }${extraStr} in ${u.stringify(data)}\n`
            ).fullContractAndValue()
          )
        }
        return oldNestedChecker.call(self, data, next, context)
      },

      strict: function() {
        const self = this
        return self
      },
    })
    return result.rename('object.strict')
  }

  self.needsWrappingIfAny(_.values(self.fieldContracts))
  self.toString = function() {
    const self = this
    return `c.object({${_.map(self.fieldContracts, function(v, k) {
      return `${k}: ${v}`
    }).join(', ')}})`
  }
  return self
}
exports.object = object

// ---
//
// Relevant utility functions
//

function fromExample(v, withQuestionMark) {
  if (_.isArray(v)) {
    return array(fromExample(v[0]))
  } else if (_.isObject(v)) {
    const result = {}
    _.each(v, function(vv, k) {
      const c = fromExample(vv)
      if (withQuestionMark && /^\?/.test(k)) {
      } else {
        result[k] = c
      }
    })
    return object(result)
  } else if (_.isString(v)) {
    return string
  } else if (_.isNumber(v)) {
    return number
  } else if (_.isBoolean(v)) {
    return bool
  } else if (_.isRegExp(v)) {
    regexp(v)
  } else if (_.isFunction(v)) {
    return anyFunction
  } else {
    throw new errors.ContractLibraryError(
      'fromExample',
      false,
      `can't create a contract from ${v}`
    )
  }
}
exports.fromExample = fromExample

const documentationTable = {}

exports.documentationTable = documentationTable

function ensureDocumentationTable(moduleName) {
  moduleName = _.isUndefined(moduleName) ? false : moduleName

  if (!documentationTable[moduleName])
    documentationTable[moduleName] = {
      doc: [],
      categories: [],
      types: {},
      values: {},
    }

  return moduleName
}

function documentModule(moduleName /* ... */) {
  moduleName = ensureDocumentationTable(moduleName)

  documentationTable[moduleName].doc = documentationTable[
    moduleName
  ].doc.concat(Array.from(arguments).slice(1))
}
exports.documentModule = documentModule

function documentCategory(moduleName, category /* ... */) {
  moduleName = ensureDocumentationTable(moduleName)

  currentCategory = category
  documentationTable[moduleName].categories.push = {
    name: category,
    doc: Array.from(arguments).slice(2),
  }
}
exports.documentCategory = documentCategory

function documentType(moduleName, contract) {
  if (builtInContractNames.has(contract.contractName))
    throw new errors.ContractLibraryError(
      '`documentType` called on a contract that still has its built-in name.'
    )

  moduleName = ensureDocumentationTable(moduleName)

  if (documentationTable[moduleName].types[contract.contractName])
    throw new errors.ContractLibraryError(
      `\`documentType\` called with a contract whose name that is already documented: ${contract}`
    )

  documentationTable[moduleName].types[contract.contractName] = contract
}
exports.documentType = documentType

function publish(moduleName, self, contracts, /* opt */ additionalExports) {
  moduleName = ensureDocumentationTable(moduleName)

  const result = additionalExports ? u.clone(additionalExports) : {}
  _.each(contracts, function(c, n) {
    if (!_.has(self, n))
      throw new errors.ContractLibraryError(
        'publish',
        false,
        `${n} is missing in the implementation`
      )
    documentationTable[moduleName].values[n] = c
    result[n] = c.wrap(self[n], n)
  })
  return result
}
exports.publish = publish

function wrapAll(self, contracts) {
  return publish(undefined, self, contracts)
}
exports.wrapAll = wrapAll

exports.c = exports

collectingBuiltInContractNames = false

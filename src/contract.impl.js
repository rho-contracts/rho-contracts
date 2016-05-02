// -*- js-indent-level: 2 -*-
"use strict";

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint eqeqeq:true, bitwise:true, forin:true, immed:true, latedef:true, newcap:true, undef:true, strict:false, node:true, loopfunc:true, latedef:false */

var util = require('util');
var u = require('./utils');
var _ = require('underscore');
var errors = require('./errors');

exports.privates = {};


// Throughout this file, `var self = this` indicates that the function is
// intended to be called (and thought of) as a method (regardless of whether
// `self` is actually used within the body of the function.

// Without `Error.stackTraceLimit = Infinity;`, often no stack trace is printed at all. By default, node records only 10 stack
// frames, and since the contract checking is done recursively, easily the first 10 frames are inside the contract
// library --and those frames are not printed since they are not interesting.

Error.stackTraceLimit = Infinity;

exports.setErrorMessageInspectionDepth = u.setErrorMessageInspectionDepth;


//--
//
// Basic recursive checking with path tracking
//

function checkWContext(contract, data, context) {
  if (contract.isOptional && u.isMissing(data)) {
    // ok
  } else {
    if (!contract.firstChecker(data)) {
      context.fail(new errors.ContractError(context).expected(contract.contractName, data).fullContractAndValue());
    }
    if (contract.needsWrapping && !context.wrapping) {
      throw new errors.ContractLibraryError("check", context, "This contract requires wrapping. Call wrap() instead and retain the wrapped result.").fullContract();
    }

    contract.nestedChecker(data, function(nextContract, nextV, nextContext) {
      if (nextContext !== errors.stackContextItems.silent) { context.stack.push(nextContext);}
      checkWContext(_autoToContract(nextContract), nextV, context);
      if (nextContext !== errors.stackContextItems.silent) { context.stack.pop();}
    }, context);
  }
}

function wrapWContext(contract, data, context) {
  if (contract.isOptional && u.isMissing(data)) {
    return data;
  } else {
    return contract.wrapper(data, function (nextContract, nextV, nextContext) {
      if (nextContext !== errors.stackContextItems.silent) { context.stack.push(nextContext);}
      var c = _autoToContract(nextContract);
      var subWrap = (!c.needsWrapping ? nextV : wrapWContext(c, nextV, context));
      if (nextContext !== errors.stackContextItems.silent) { context.stack.pop();}
      return subWrap;
    }, context);
  }
}

function checkWrapWContext(contract, data, context) {
  var c = _autoToContract(contract);
  checkWContext(c, data, context);
  if (!contract.needsWrapping)
    return data;
  else {
    if (!context.wrappedAt) {
      context.wrappedAt = errors.captureCleanStack();
    }
    return wrapWContext(c, data, context);
  }
}
exports.privates.checkWrapWContext = checkWrapWContext;

function newContext(thingName, data, contract, wrapping) {
  return { thingName: thingName,
           blameMe: true,
           data: data,
           stack: [],
           fail: function (e) { e.captureCleanStack(); throw e; },
           contract: contract,
           wrapping: wrapping };
}

//--
//
// Base class for contracts
//


// State for the documentation mechanisms:
var builtInContractNames = [];
var collectingBuiltInContractNames = true;
var currentCategory = false;


function Contract(name, // name: the name of the contract as it should appear in the error messages
                  spec) {
  this.contractName = name;
  if (collectingBuiltInContractNames && !_.contains(builtInContractNames, name)) builtInContractNames.push(name);
  _.extend(this, spec || {});
}
exports.privates.Contract = Contract;

Contract.prototype = {
  signal: u.contractSignal,
  theDoc: [],
  category: false,
  needsWrapping: false,
  location: false,
  thingName: false, // thingName: Only used for generating documentation,
  // and for passing as the `name` argument of `check`.
  isOptional: false,

  needsWrappingIfAny: function (contracts) {
    var self = this;
    if (_.any(_.map(contracts, _autoToContract), function (c) { return c.needsWrapping; }))
      self.needsWrapping = true;
  },

  firstChecker: function (data) { var self = this; return true; },
  nestedChecker: function (data, next) { var self = this; },
  wrapper: function (data, next, context) {
    var self = this;
    throw new errors.ContractLibraryError(wrap, context, "called on a contract that does not implements wrapping")
      .fullContract();
  },
  check: function (data, /* opt */ name) {
    var self = this;
    checkWContext(this, data, newContext(name || self.thingName, data, this, false));
    return data;
  },
  wrap: function (data, name) {
    var self = this;
    var context = newContext(name || self.thingName, data, this, true);
    return checkWrapWContext(this, data, context);
  },
  toString: function () { var self = this; return "c." + self.contractName + '(' + self.subToString().join(", ") + ')'; },
  subToString: function () { var self = this; return []; },
  rename: function (name) {
    var self = this;
    if (collectingBuiltInContractNames && !_.contains(builtInContractNames, name)) builtInContractNames.push(name);
    return u.gentleUpdate(this, { contractName: name, toString: function(){return "c."+name;} });
  },

  optional: function () {
    var self = this;
    var oldToString = self.toString;
    return u.gentleUpdate(this, { isOptional: true,
                                toString: function () { var self = this; return 'c.optional(' + oldToString.call(self) + ')'; }
                              });
  },

  doc: function (/*...*/) {
    var self = this;
    return u.gentleUpdate(this, { theDoc: _.toArray(arguments), category: currentCategory }); }
};

exports.Contract = Contract;

//--
//
// Elementary contract functions
//

function _toContract (v, upgradeObjects) {
  if (u.isContractInstance(v)) {
    return v;
  }
  else if (_.isArray(v)) {
    if (_.isUndefined(v[0])) throw new errors.ContractLibraryError('toContract', false, "the example element of the array is missing. " + v);
    if (_.size(v) > 1) throw new errors.ContractLibraryError('toContract', false, "the given array has more than one element: " + v);
    return array(_toContract(v[0], upgradeObjects));
  }
  else if (!_.isObject(v) && !_.isFunction(v)) {
    return value(v);
  }
  else if (_.isObject(v) && upgradeObjects) {
    return object(
      _.mapObject(v,
                  _.partial(
                    _toContract, _, true)));
  }
  else throw new errors.ContractLibraryError('toContract', false, "Cannot promote " + u.stringify(v) + " to a contract");

}

function _autoToContract (v) { return _toContract(v, false); }
exports.privates._autoToContract = _autoToContract;

exports.toContract = function (v) { return _toContract(v, true); };

function check(contract, data, /* opt */ name) {
  _autoToContract(contract).check(data, name);
  return data;
}
exports.check = check;

function wrap(contract, data, name) {
  return _autoToContract(contract).wrap(data, name);
}
exports.wrap = wrap;

function optional(contract) {
  return contract.optional();
}
exports.optional = optional;

var any = new Contract('any');
exports.any = any;

function pred(fn) { return new Contract('unamed-pred', { firstChecker: fn }); }
exports.pred = pred;

var nothing = pred(function (data) { return false; }).rename('nothing');
exports.nothing = nothing;

/*
function not(c) { return

*/
var falsy = pred(function (data) { return !data; }).rename('falsy');
exports.falsy = falsy;

var truthy = pred(function (data) { return !!data; }).rename('truthy');
exports.truthy = truthy;

function oneOf(/*...*/) {
  return new Contract('oneOf('+_.toArray(arguments).join(', ')+')',
                      { firstChecker: function (vv) { var self = this; return _.contains(self.values, vv); },
                        values: _.toArray(arguments),
                        toString: function () { var self = this; return 'c.'+self.contractName; }});
}
exports.oneOf = oneOf;

function value(v) { return oneOf(v).rename('value('+v+')'); }
exports.value = value;


var string = pred(_.isString).rename('string');
exports.string = string;

var number = pred(_.isNumber).rename('number');
exports.number = number;

var integer =
  pred(function (v) { return Math.floor(v) === v; })
  .rename('integer');
exports.integer = integer;

var bool = pred(_.isBoolean).rename('bool');
exports.bool = bool;

var regexp = pred(_.isRegExp).rename('regexp');
exports.regexp = regexp;

var date = pred(_.isDate).rename('Date');
exports.date = date;

var anyFunction = pred(_.isFunction).rename('fun(...)');
exports.anyFunction = anyFunction;

var isA = function(parent) {
  var name = u.functionName(parent) || '...';
  return pred(function (v) { return v instanceof parent; }).rename('isA(' + name + ')');
};
exports.isA = isA;

var error = isA(Error).rename('error');
exports.error = error;

var contract = pred(function (v) {
  return u.isContractInstance(v) || _.isArray(v) || !_.isObject(v);
}).rename('contract');
exports.contract = contract;

var quacksLike = function(parent, name) {
  return fromExample(parent).rename('quacksLike('+(name||"...")+')');
};
exports.quacksLike = quacksLike;


//--
//
// Contract combiners
//

function checkMany(silent, contracts, data, next) {
  _(contracts).each(function (c, i) {
    if (silent) next(c, data, errors.stackContextItems.silent);
    else next(c, data, errors.stackContextItems.and(i));
  });
}

function makeAnd(silent) {
  return function(/* ... */) {
    var self = new Contract('and');
    self.contracts = _.toArray(arguments);
    self.nestedChecker = function (data, next) { var self = this; checkMany(silent, self.contracts, data, next); };
    self.wrapper = function (data, next, context) {
      var self = this;
      throw new errors.ContractLibraryError('wrap', context, "Cannot wrap an `and` contract").fullContract();
    };
    self.needsWrappingIfAny(self.contracts);
    self.subToString = function () { var self = this; return self.contracts; };
    return self;
  };
}
var silentAnd = makeAnd(true);
var and = makeAnd(false);
exports.silentAnd = silentAnd;
exports.and = and;

function matches (r) {
  var name = 'matches('+r+')';
  return pred(function (v) { return r.test(v); }).rename(name);
}
exports.matches = matches;

function or (/* ... */) {
  var self = new Contract('or');
  self.contracts = _.filter(arguments, function (c) { var self = this; return !c.needsWrapping; });
  self.wrappingContracts = _.difference(arguments, self.contracts);

  if (_.size(self.wrappingContracts) > 1)
    throw new errors.ContractLibraryError('or', false,
                                   "Or-contracts can only take at most one wrapping contracts, got " +
                                   self.wrappingContracts);

  self.nestedChecker = function (data, next, context) {
    var self = this;
    var allContracts = _.union(self.contracts, self.wrappingContracts);
    var exceptions = [];

    var oldFail = context.fail;
    var success = false;

    _(allContracts).each(function (contract) {
      var failed = false;
      if (!success) {
        context.fail = function (e) { exceptions.push({ c: contract, e: e }); failed = true; };
        next(contract, data, errors.stackContextItems.silent);
        if (!failed) success =  contract;
      }
    });
    context.fail = oldFail;

    if (!success) {
      var msg =
        "none of the contracts passed:\n" +
        _(allContracts).map(function(c) {return " - " + c.toString();}).join("\n") +
        "\n\nThe failures were:\n" +
        _(exceptions).map(function(c_e, i) {return "["+ (i+1) + "] --\n" + c_e.c.toString() + ": " + c_e.e.message;}).join("\n\n") + '\n';

      context.fail(new errors.ContractError(context, msg)
                   .fullContractAndValue(context));
    }
    return success; // return the successful contract to self.wrapper
  };
  self.wrapper = function (data, next, context) {
    var self = this;
    var c = self.nestedChecker(data, function () { }, context); // this is a bit of a hack.
    return next(c, data, errors.stackContextItems.or);
  };
  self.needsWrappingIfAny(_.union(self.contracts, self.wrappingContracts));
  return self;
}
exports.or = or;


function cyclic(/*opt*/ needsWrapping) {
  var self = new Contract('cyclic');
  self.needsWrapping = (_.isUndefined(needsWrapping) ? true : false);
  self.closeCycle = function (c) {
    var self = this;
    if (self.needsWrapping !== c.needsWrapping)
      throw new errors.ContractLibraryError(self.contractName, false, "A " + self.contractName + "() was started with needsWrapping="+self.needsWrapping+
                                     ", but it was closed with a contract that has needsWrapping="+c.needsWrapping+":\n"+ c);

    _.each(c, function(v, k) {
      self[k] = v;
    });
    return self;
  };
  return self;
}
exports.cyclic = cyclic;

function forwardRef(/*opt*/ needsWrapping) {
  var result = cyclic(_.isUndefined(needsWrapping) ? false : true).rename('forwardRef');
  result.setRef = result.closeCycle;
  delete result.closeCycle;
  return result;
}
exports.forwardRef = forwardRef;


//--
//
// Data structure contracts
//

function array(itemContract) {
  var self = new Contract('array');
  self.itemContract = itemContract;
  self.firstChecker = _.isArray;
  self.nestedChecker = function (data, next) {
    var self = this;
    _.each(data, function (item, i) {
      next(self.itemContract, item, errors.stackContextItems.arrayItem(i));
    });
  };
  self.wrapper = function (data, next) {
    var self = this;
    var result =  _.map(data, function (item, i) {
      return next(self.itemContract, item, errors.stackContextItems.arrayItem(i));
    });
    return result;
  };
  self.needsWrappingIfAny([itemContract]);
  self.subToString = function () { var self = this; return [self.itemContract];};
  return self;
}
exports.array = array;

function tuple(/* ... */) {
  var self = new Contract('tuple');
  self.contracts = _.toArray(arguments);
  self.firstChecker = _.isArray;
  self.nestedChecker = function (data, next, context) {
    var self = this;
    if (_.size(data) < _.size(self.contracts)) {
      context.fail(new errors.ContractError(context).expected("tuple of size " + _.size(self.contracts), data));
    }

    _.zip(self.contracts, data.slice(0, _.size(self.contracts))).forEach(function (pair, i) {
      next(pair[0], pair[1], errors.stackContextItems.tupleItem(i));
    });

  };
  self.wrapper = function (data, next) {
    var self = this;
    return _.map(_.zip(self.contracts, data.slice(0, _.size(self.contracts))),
                  function (pair, i) {
                    return next(pair[0], pair[1], errors.stackContextItems.tupleItem(i));
                  });
  };

  self.strict = function () {
    var self = this;
    var oldNestedChecker = self.nestedChecker;
    var result = u.gentleUpdate(self, {
      nestedChecker: function (data, next, context) {
        var self = this;
        if (_.size(data) !== _.size(self.contracts)) {
          context.fail(new errors.ContractError(context)
                       .expected("tuple of exactly size " + _.size(self.contracts), data)
                       .fullContractAndValue());
        }
        return oldNestedChecker.call(self, data, next, context);
      },

      strict: function () { var self = this; return self; }
    });

    return result.rename('tuple.strict');
  };

  self.needsWrappingIfAny(self.contracts);
  self.subToString = function () { var self = this; return self.contracts; };
  return self;
}
exports.tuple = tuple;

function hash(valueContract) {
  var self = new Contract('hash');
  self.valueContract = valueContract;
  self.firstChecker = function (v) {
    return _.isObject(v) && !u.isContractInstance(v);
  };
  self.nestedChecker = function (data, next, context) {
    var self = this;
    _.each(data, function (v, k) {
      next(self.valueContract, v, errors.stackContextItems.hashItem(k));
    });
  };
  self.wrapper = function (data, next, context) {
    var self = this;
    var result = u.clone(data);
    _.each(result, function (v, k) {
      result[k] = next(self.valueContract, v, errors.stackContextItems.hashItem(k));
    });
    return result;
  };
  self.needsWrappingIfAny([self.valueContract]);
  self.subToString = function () { var self = this; return [self.valueContract]; };
  return self;
}
exports.hash = hash;

function object(/*opt*/ fieldContracts) {
  var self = new Contract('object');
  self.fieldContracts = {};
  _.each(fieldContracts, function(c, k) { self.fieldContracts[k] = _autoToContract(c); });

  self.firstChecker = _.isObject;
  self.nestedChecker = function (data, next, context) {
    var self = this;

    _(self.fieldContracts).each(function (contract, field) {
      if (!contract.isOptional && u.isMissing(data[field])) {
        context.fail(new errors.ContractError(context, "Field `" + field + "` required, got " + u.stringify(data)).fullContractAndValue());
      }
      if (!u.isMissing(data[field])) next(contract, data[field], errors.stackContextItems.objectField(field));
    });
  };
  self.wrapper = function (data, next) {
    var self = this;
    var result = u.clone(data);

    _(self.fieldContracts).each(function (contract, field) {
      if (contract.needsWrapping) {
        result[field] = next(u.gentleUpdate(contract, { thingName: field }),
                             data[field],
                             errors.stackContextItems.objectField(field));
      }
    });

    return result;
  };

  self.extend = function (newFields) {
    var self = this;
    var oldToString = self.toString;
    return u.gentleUpdate(self, { fieldContracts: u.gentleUpdate(self.fieldContracts, newFields) }); // TODO: toString when being renamed
  };

  self.strict = function () {
    var self = this;
    var oldNestedChecker = self.nestedChecker;
    var result = u.gentleUpdate(self, {
      nestedChecker: function (data, next, context) {
        var self = this;
        var extra = _.difference(_.keys(data), _.keys(self.fieldContracts));
        if (!_.isEmpty(extra)) {
          var extraStr = _.map(extra, function(k) { return '`'+k+'`'; }).join(', ');

          context.fail(new errors.ContractError
                       (context,
                        "Found the extra field" + (_.size(extra) === 1 ? " " : "s ") + extraStr + " in " +
                        u.stringify(data) + "\n")
                       .fullContractAndValue());
        }
        return oldNestedChecker.call(self, data, next, context);
      },

      strict: function () { var self = this; return self; }
    });
    return result.rename('object.strict');
  };

  self.needsWrappingIfAny(_.values(self.fieldContracts));
  self.toString = function () {
    var self = this;
    return "c.object({"+ _.map(self.fieldContracts, function(v, k) { return k+": "+v; }).join(", ") + "})";
  };
  return self;
}
exports.object = object;


//---
//
// Relevant utility functions
//

function fromExample(v, withQuestionMark) {
  if (_.isArray(v)) {
    return array(fromExample(v[0]));

  } else if (_.isObject(v)) {
    var result = {};
    _.each(v, function(vv, k) {
      var c = fromExample(vv);
      if (withQuestionMark && /^\?/.test(k)) {
      } else {
        result[k] = c;
      }
    });
    return object(result);

  } else if (_.isString(v)) {
    return string;

  } else if (_.isNumber(v)) {
    return number;

  } else if (_.isBoolean(v)) {
    return bool;

  } else if (_.isRegExp(v)) {
    regexp(v);

  } else if (_.isFunction(v)) {
    return anyFunction;

  } else {
    throw new errors.ContractLibraryError('fromExample', false, "can't create a contract from " + v);
  }

}
exports.fromExample = fromExample;

var documentationTable = {};

exports.documentationTable = documentationTable;

function ensureDocumentationTable(moduleName) {
  moduleName = (_.isUndefined(moduleName) ? false : moduleName);

  if (!documentationTable[moduleName])
    documentationTable[moduleName] = { doc: [], categories: [], types: {}, values: {}};

  return moduleName;
}

function documentModule(moduleName /* ... */) {
  moduleName = ensureDocumentationTable(moduleName);

  documentationTable[moduleName].doc =
    documentationTable[moduleName].doc.concat(_.toArray(arguments).slice(1));
}
exports.documentModule = documentModule;

function documentCategory(moduleName, category /*...*/) {
  moduleName = ensureDocumentationTable(moduleName);

  currentCategory = category;
  documentationTable[moduleName].categories.push = { name: category, doc: _.toArray(arguments).slice(2) };
}
exports.documentCategory = documentCategory;

function documentType(moduleName, contract) {
  if (_.contains(builtInContractNames, contract.contractName))
    throw new errors.ContractLibraryError('`documentType` called on a contract that still has its built-in name.');

  moduleName = ensureDocumentationTable(moduleName);

  if (documentationTable[moduleName].types[contract.contractName])
    throw new errors.ContractLibraryError('`documentType` called with a contract whose name that is already documented: ' + contract);

  documentationTable[moduleName].types[contract.contractName] = contract;
}
exports.documentType = documentType;

function publish(moduleName, self, contracts, /*opt*/ additionalExports) {
  moduleName = ensureDocumentationTable(moduleName);

  var result = (additionalExports ? u.clone(additionalExports) : {});
  _.each(contracts, function (c, n) {
    if (!_.has(self, n))
      throw new errors.ContractLibraryError('publish', false, n + " is missing in the implementation");
    documentationTable[moduleName].values[n] = c;
    result[n] = c.wrap(self[n], n);
  });
  return result;
}
exports.publish = publish;

function wrapAll(self, contracts) {
  return publish(undefined, self, contracts);
}
exports.wrapAll = wrapAll;

exports.c = exports;

collectingBuiltInContractNames = false;

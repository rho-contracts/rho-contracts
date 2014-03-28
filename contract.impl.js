// -*- js-indent-level: 2 -*-
"use strict";

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint eqeqeq:true, bitwise:true, forin:true, immed:true, latedef: true, newcap: true undef: true, strict: true */
/*global exports, require */

var util = require('util');
var __ = require('underscore'); // '__' because node already binds '_' 
var grabStack = require('callsite');

exports.privates = {};


// Throughout this file, `var self = this` indicates that the function is
// intended to be called (and thought of) as a method (regardless of whether 
// `self` is actually used within the body of the function.



//--
//
// Helper Functions
//

function isMissing(v) { 
  return __.isUndefined(v) || v === null;
}

function clone(obj) {
  var other = __.clone(obj);
  other.__proto__ = obj.__proto__;
  return other;
}

function gentleUpdate(obj, spec) { // aka, not an imperative update. aka, no bang.
  var other = clone(obj);
  __.each(spec, function(v, k) { other[k] = v; });
  return other;
}

function ith(i) {
  i++;
  switch (i % 10) {
  case 1: return i+"st";
  case 2: return i+"nd";
  case 3: return i+"rd";
  default: return i+"th";
  }
}

function stringify(v) {
  return util.inspect(v, false, errorMessageInspectionDepth, false);
}

//--
//
// Stack context items
//

var stackContextItems = {
  argument: function (arg) {
    return { short: (__.isNumber(arg) ? ".arg("+arg+")" : "."+arg),
             long: "for the " + (__.isNumber(arg) ? ith(arg) : "`"+arg+"`") + " argument of the call." };
  },
  
  this: { short: ".this",
          long: "for this `this` argument of the call."},
  
  result: { short: ".result",
            long: "for the return value of the call." },
  
  extraArguments: { short: ".extraArguments",
                    long: "for the extra argument array of the call" },
  
  and: function(i) { 
    return { short: ".and("+i+")",
             long: "for the " + ith(i) + " branch of the `and` contract." }; 
  },
  
  or: function(i) { 
    return { short: ".or" }; 
  },
  
  arrayItem: function (i) {
    return { short: "["+i+"]",
             long: "for the " + ith(i) + " element of the array.",
             i: i };
  },
  
  tupleItem: function (i) {
    return { short: "["+i+"]",
             long: "for the " + ith(i) + " element of the tuple." };
  },
  
  hashItem: function (k) {
    return { short: "." + k,
             long: "for the key `" + k + "` of the hash." };
  },
  
  objectField: function (f) {
    return { short: "." + f,
             long: "for the field `" + f + "` of the object." };
  },
  
  silent: { short: "", long: "" } // .silent is special, tested with === in `checkWContext` 
  
};

//--
//
// Error classes
//

var errorMessageInspectionDepth = null;
exports.setErrorMessageInspectionDepth = function(depth) {
  errorMessageInspectionDepth = depth;
}

function cleanStack(stack) {
  var stack = clone(stack);
  stack.shift();
  var irrelevantFileNames = [ /\/contract.face.js$/, /\/contract.impl.js$/, /\/underscore.js$/, 
                              /^native array.js$/, /^module.js$/, /^native messages.js$/, /^undefined$/ ];
  while(!__.isEmpty(stack)) {
    if (__.any(irrelevantFileNames, function (r) { 
      return r.test(stack[0].getFileName()); })) {
      stack.shift();
    } else {
      break;
    }
  }
  return stack;
}

function captureCleanStack() { 
  return cleanStack(grabStack() || []);
}

function prettyPrintStack(stack) {
  return __.map(stack, function(callsite) {
    return "  at " + callsite.getFunctionName() +
          " (" + callsite.getFileName() + ":" + callsite.getLineNumber() + ":" + callsite.getColumnNumber() + ")";
  }).join('\n')
}

function ContractError(/*opt*/ context, /*opt*/ msg) { 
  var self = Error.prototype.constructor.apply(this, [msg]);

  self.constructor = ContractError;
  self.name = 'ContractError';
  self.context = context;
  self.message = '';
  self.stack = null;

  var hasBlame = self.context && self.context.thingName;
  if (hasBlame) self.blame(context);
  if (hasBlame && msg) self.message += ' ';
  if (msg) self.message += msg;
  if (hasBlame || msg) self.message += "\n";

  if (self.context && self.context.wrappedAt && self.context.wrappedAt[0]) {
    var callsite = self.context.wrappedAt[0];
    self.message += "(contract was wrapped at: " + callsite.getFileName() +":"+callsite.getLineNumber() +")\n";
  }

  return self;
}
exports.ContractError = ContractError;

ContractError.prototype = __.extend(Error.prototype, {  

  captureStack: function () {
    var self = this;
    self.renderedStack = prettyPrintStack(cleanStack(grabStack() || []))
    Object.defineProperty(self, 'stack', {
      get: function () {
        return this.name + ": " + this.message + "\n" + self.renderedStack;
      }
    });
  },

  blame: function(context) {
    var self = this; 
    
    self.context = context || self.context;

    var thingNameWithParens = self.context.thingName + (self.context.contract.isFunctionContract ? "()" : "");
  
    if (!self.context.wrapping) {
      self.message += "check on `" + thingNameWithParens + "` failed";
    } else if (self.context.blameMe) {
      self.message += "`" + thingNameWithParens + "` broke its contract";
    } else {
      self.message += "on `" + thingNameWithParens + "`";
    }
  },

  expected: function(expected, data, /*opt*/ context) {
    var self = this; 
    
    self.context = context || self.context;
    self.expected = expected;
    self.data = data;
    self.message += "Expected " + expected + ", but got " + stringify(data) + "\n";
    return this;
  },
  
  fullValue: function(/*opt*/ context) {
    var self = this; 
    
    self.context = context || self.context;
    if (!__.isFunction(self.context.data))    // Don't bother printing functions,
      if (!self.expected ||                   // if expected() has not already printed the value
          !__.isEmpty(self.context.stack))    // or there is a stack, so expected() has printed only 
        //                                       a small piece of the value.
        self.message += "The full value being checked was:\n" + stringify(self.context.data) + "\n";
    return this;
  },
  
  fullContract: function (/*opt*/ context) {
    var self = this; 
    
    self.context = context || self.context;
    
    if (!__.isEmpty(self.context.stack)) {
      var stack = self.context.stack;
      var immediateContext = __.last(stack);

      if (stack[stack.length-2] === stackContextItems.extraArguments) {
        // Special case for error messages of extra arguments
        // Invariant: the immediate context is always a stackContextItems.arrayItem, 
        // which always hash a `i` field

        self.message += "for the " + ith(immediateContext.i) + " extra argument of the call.\n"
        stack = stack.slice(0, -2);

      } else if (immediateContext.long) {
        self.message += immediateContext.long +"\n";
        stack = stack.slice(0, -1);
      }

      if (!__.isEmpty(stack)) {
        var stackStrings = __.map(stack, function(i) { return (i.short ? i.short : i); });
        self.message += ("at position " + stackStrings.join("") +"\n"+
                         "in contract:\n" + self.context.contract.toString() + "\n");
      }
    }
    return this;
  },
  
  fullContractAndValue: function (/*opt*/ context) {
    var self = this;
    
    self.fullContract(context);
    self.fullValue(context);
    return this;
  }
});
                                    
exports.ContractError = ContractError;

function ContractLibraryError(fnName, /*opt*/ context, /*opt*/ msg) { 
  var self = ContractError.call(this, context, msg);
  self.name = 'ContractLibraryError';
  self.functionName = fnName;
  self.message = fnName + ": " + self.message;
  return self;
}
ContractLibraryError.prototype = ContractError.prototype;

exports.privates.ContractLibraryError = ContractLibraryError;


//--
//
// Basic recursive checking with path tracking
//

var toContract;

function checkWContext(contract, data, context) { 
  if (contract.isOptional && !data) {
    // ok
  } else {
    if (!contract.firstChecker(data)) {
      context.fail(new ContractError(context).expected(contract.contractName, data).fullContractAndValue());
    }
    if (contract.needsWrapping && !context.wrapping) {
      throw new ContractLibraryError("check", context, "This contract requires wrapping. Call wrap() instead and retain the wrapped result.").fullContract()
    }
    
    contract.nestedChecker(data, function(nextContract, nextV, nextContext) {
      if (nextContext !== stackContextItems.silent) { context.stack.push(nextContext);}
      checkWContext(toContract(nextContract), nextV, context);
      if (nextContext !== stackContextItems.silent) { context.stack.pop();}
    }, context);
  }
}

function wrapWContext(contract, data, context) {
  if (contract.isOptional && !data) {
    return data;
  } else {
    return contract.wrapper(data, function (nextContract, nextV, nextContext) {
      if (nextContext !== stackContextItems.silent) { context.stack.push(nextContext);}
      var c = toContract(nextContract);
      var subWrap = (!c.needsWrapping ? nextV : wrapWContext(c, nextV, context));
      if (nextContext !== stackContextItems.silent) { context.stack.pop();}
      return subWrap;
    }, context);
  }
}

function checkWrapWContext(contract, data, context) { 
  var c = toContract(contract);
  checkWContext(c, data, context);
  if (!contract.needsWrapping) 
    return data;
  else {
    if (!context.wrappedAt) {
      context.wrappedAt = captureCleanStack();
    }
    return wrapWContext(c, data, context);
  }
}

function newContext(thingName, data, contract, wrapping) {
  return { thingName: thingName, 
           blameMe: true, 
           data: data, 
           stack: [], 
           fail: function (e) { e.captureStack(); throw e },
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
  if (collectingBuiltInContractNames && !__.contains(builtInContractNames, name)) builtInContractNames.push(name);
  __.extend(this, spec || {});
}

Contract.prototype = { 
  theDoc: [],
  category: false,
  needsWrapping: false,
  location: false,
  thingName: false, // thingName: Only used for generating documentation, 
  // and for passing as the `name` argument of `check`.
  isOptional: false,

  needsWrappingIfAny: function (contracts) {
    var self = this;
    if (__.any(contracts, function (c) { return c.needsWrapping; }))
      self.needsWrapping = true;
  },

  firstChecker: function (data) { var self = this; return true; },
  nestedChecker: function (data, next) { var self = this; },
  wrapper: function (data, next, context) { 
    var self = this; 
    throw new ContractLibraryError(wrap, context, "called on a contract that does not implements wrapping")
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
    if (collectingBuiltInContractNames && !__.contains(builtInContractNames, name)) builtInContractNames.push(name);
    return gentleUpdate(this, { contractName: name, toString: function(){return "c."+name;} }); 
  },
  
  optional: function () { 
    var self = this; 
    var oldToString = self.toString;
    return gentleUpdate(this, { isOptional: true,
                                toString: function () { var self = this; return 'c.optional(' + oldToString.call(self) + ')'; }
                              }); 
  },

  doc: function (/*...*/) { 
    var self = this;
    return gentleUpdate(this, { theDoc: __.toArray(arguments), category: currentCategory }); }
};

exports.Contract = Contract;


//--
//
// Elementary contract functions
//

var pred, value, array, object;

function toContract (v) {
  if (v instanceof Contract) {
    return v;
  } else if (__.isFunction(v)) {
    return pred(v);
  }
  else if (__.isArray(v)) {
    if (__.isUndefined(v[0])) throw new ContractLibraryError('toContract', false, "the element contract missing. " + v);
    if (__.size(v) > 1) throw new ContractLibraryError('toContract', false, "the given array has more than one element: " + v);
    return array(v[0]);
  }
  else if (__.isObject(v)) {
    return object(v);
  } else {
    return value(v);
  }
}
exports.toContract = toContract;

function check(contract, data, /* opt */ name) {
  toContract(contract).check(data, name);
  return data;
}
exports.check = check;

function wrap(contract, data, name) {
  return toContract(contract).wrap(data, name);
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
  return new Contract('oneOf('+__.toArray(arguments).join(', ')+')', 
                      { firstChecker: function (vv) { var self = this; return __.contains(self.values, vv); },
                        values: __.toArray(arguments),
                        toString: function () { var self = this; return 'c.'+self.contractName; }});
}
exports.oneOf = oneOf;

function value(v) { return oneOf(v).rename('value('+v+')'); }
exports.value = value;


var string = pred(__.isString).rename('string');
exports.string = string;

var number = pred(__.isNumber).rename('number');
exports.number = number;

var integer = 
  pred(function (v) { return Math.floor(v) === v; })
  .rename('integer');
exports.integer = integer;

var bool = pred(__.isBoolean).rename('bool');
exports.bool = bool;

var regexp = pred(__.isRegExp).rename('regexp');
exports.regexp = regexp;

var anyFunction = pred(__.isFunction).rename('fun(...)');
exports.anyFunction = anyFunction;

var isA = function(parent, name) {
  return pred(function (v) { return v instanceof parent; }).rename('isA('+(name||"...")+')');
};
exports.isA = isA;

var contract = pred(function (v) { return !__.isUndefined(v); }).rename('contract');
exports.contract = contract;

var fromExample;

var quacksLike = function(parent, name) {
  return fromExample(parent).rename('quacksLike('+(name||"...")+')');
};
exports.quacksLike = quacksLike;


//--
//
// Contract combiners
//

function checkMany(silent, contracts, data, next) {
  __(contracts).each(function (c, i) {
    if (silent) next(c, data, stackContextItems.silent);
    else next(c, data, stackContextItems.and(i));
  });
}

function makeAnd(silent) {
  return function(/* ... */) {
    var self = new Contract('and');
    self.contracts = __.toArray(arguments);
    self.nestedChecker = function (data, next) { var self = this; checkMany(silent, self.contracts, data, next); };
    self.wrapper = function (data, next, context) { 
      var self = this; 
      throw new ContractLibraryError('wrap', context, "Cannot wrap an `and` contract").fullContract();
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
  var name = 'matches('+r+')'
  return pred(function (v) { return r.test(v); }).rename(name)
}
exports.matches = matches;

function or (/* ... */) {
  var self = new Contract('or');
  self.contracts = __.filter(arguments, function (c) { var self = this; return !c.needsWrapping; });
  self.wrappingContracts = __.difference(arguments, self.contracts);
  
  if (__.size(self.wrappingContracts) > 1)
    throw new ContractLibraryError('or', false, 
                                   "Or-contracts can only take at most one wrapping contracts, got " + 
                                   self.wrappingContracts);

  self.nestedChecker = function (data, next, context) {
    var self = this; 
    var allContracts = __.union(self.contracts, self.wrappingContracts);
    var exceptions = [];

    var oldFail = context.fail;
    var success = false;

    __(allContracts).each(function (contract) {
      var failed = false;
      if (!success) {
        context.fail = function (e) { exceptions.push({ c: contract, e: e }); failed = true; }
        next(contract, data, stackContextItems.silent);
        if (!failed) success =  contract;
      }
    });
    context.fail = oldFail;

    if (!success) {
      var msg = 
        "none of the contracts passed:\n" +
        __(allContracts).map(function(c) {return " - " + c.toString();}).join("\n") +
        "\n\nThe failures were:\n" +
        __(exceptions).map(function(c_e, i) {return "["+ (i+1) + "] --\n" + c_e.c.toString() + ": " + c_e.e.message;}).join("\n\n") + '\n';

      context.fail(new ContractError(context, msg)
                   .fullContractAndValue(context));
    }
    return success; // return the successful contract to self.wrapper
  };
  self.wrapper = function (data, next, context) {
    var self = this; 
    var c = self.nestedChecker(data, function () { }, context); // this is a bit of a hack.
    return next(c, data, stackContextItems.or);
  };
  self.needsWrappingIfAny(__.union(self.contracts, self.wrappingContracts));
  return self;
}
exports.or = or;


function cyclic(/*opt*/ needsWrapping) {
  var self = new Contract('cyclic');
  self.needsWrapping = (__.isUndefined(needsWrapping) ? true : false);
  self.closeCycle = function (c) { 
    var self = this;
    if (self.needsWrapping !== c.needsWrapping)
        throw new ContractLibraryError(self.contractName, false, "A " + self.contractName + "() was started with needsWrapping="+self.needsWrapping+
                                     ", but it was closed with a contract that has needsWrapping="+c.needsWrapping+":\n"+ c);

    __.each(c, function(v, k) {
      self[k] = v;
    });
    return self;
  };
  return self;
}
exports.cyclic = cyclic;

function forwardRef(/*opt*/ needsWrapping) { 
  var result = cyclic(__.isUndefined(needsWrapping) ? false : true).rename('forwardRef');
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
  self.firstChecker = __.isArray;
  self.nestedChecker = function (data, next) { 
    var self = this; 
    __.each(data, function (item, i) {
      next(self.itemContract, item, stackContextItems.arrayItem(i));
    });
  };
  self.wrapper = function (data, next) {
    var self = this; 
    var result =  __.map(data, function (item, i) {
      return next(self.itemContract, item, stackContextItems.arrayItem(i));
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
  self.contracts = __.toArray(arguments);
  self.firstChecker = __.isArray;
  self.nestedChecker = function (data, next, context) {
    var self = this; 
    if (__.size(data) < __.size(self.contracts)) {
      context.fail(new ContractError(context).expected("tuple of size " + __.size(self.contracts), data));
    }

    __.zip(self.contracts, data.slice(0, __.size(self.contracts))).forEach(function (pair, i) {
      next(pair[0], pair[1], stackContextItems.tupleItem(i));
    });

  };
  self.wrapper = function (data, next) {
    var self = this; 
    return __.map(__.zip(self.contracts, data.slice(0, __.size(self.contracts))),
                  function (pair, i) {
                    return next(pair[0], pair[1], stackContextItems.tupleItem(i));
                  });
  };

  self.strict = function () {
    var self = this;
    var oldNestedChecker = self.nestedChecker;
    var result = gentleUpdate(self, { 
      nestedChecker: function (data, next, context) {
        var self = this;
        if (__.size(data) !== __.size(self.contracts)) {
          context.fail(new ContractError(context)
                       .expected("tuple of exactly size " + __.size(self.contracts), data)
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
  self.firstChecker = __.isObject;
  self.nestedChecker = function (data, next, context) {
    var self = this; 
    __.each(data, function (v, k) { 
      next(self.valueContract, v, stackContextItems.hashItem(k));
    });
  };
  self.wrapper = function (data, next, context) {
    var self = this;
    var result = clone(data);
    __.each(result, function (v, k) {
      result[k] = next(self.valueContract, v, stackContextItems.hashItem(k));
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
  self.fieldContracts = fieldContracts || {};
  self.firstChecker = __.isObject;
  self.nestedChecker = function (data, next, context) {
    var self = this;

    __(self.fieldContracts).each(function (contract, field) {
      if (!contract.isOptional && isMissing(data[field])) {
        context.fail(new ContractError(context, "Field `" + field + "` required, got " + stringify(data)).fullContractAndValue());
      }
      if (!isMissing(data[field])) next(contract, data[field], stackContextItems.objectField(field));
    });
  };
  self.wrapper = function (data, next) {
    var self = this;
    var result = clone(data);

    __(self.fieldContracts).each(function (contract, field) {
      if (__.has(data, field)) result[field] = next(gentleUpdate(contract, { thingName: field }), 
                                                    data[field], 
                                                    stackContextItems.objectField(field));
    });
    var extra = __.difference(__.keys(data), __.keys(self.fieldContracts)); 
    __(extra).each(function(f) { result[f] = data[f]; });
    
    return result;
  };

  self.extend = function (newFields) {
    var self = this;
    var oldToString = self.toString;
    return gentleUpdate(self, { fieldContracts: gentleUpdate(self.fieldContracts, newFields) }); // TODO: toString when being renamed
  };

  self.strict = function () {
    var self = this;
    var oldNestedChecker = self.nestedChecker;
    var result = gentleUpdate(self, {
      nestedChecker: function (data, next, context) {
        var self = this;
        var extra = __.difference(__.keys(data), __.keys(self.fieldContracts));
        if (!__.isEmpty(extra)) {
          var extraStr = __.map(extra, function(k) { return '`'+k+'`'; }).join(', ');

          context.fail(new ContractError
                       (context, 
                        "Found the extra field" + (__.size(extra) === 1 ? " " : "s ") + extraStr + " in " + 
                        stringify(data) + "\n")
                       .fullContractAndValue());
        }
        return oldNestedChecker.call(self, data, next, context);
      },

      strict: function () { var self = this; return self; }
    });
    return result.rename('object.strict');
  };

  self.needsWrappingIfAny(__.values(fieldContracts));
  self.toString = function () {
    var self = this;
    return "c.object({"+ __.map(self.fieldContracts, function(v, k) { return k+": "+v; }).join(", ") + "})";
  };
  return self;
}
exports.object = object;


//--
//
// Function contracts
//

function checkOptionalArgumentFormals(who, argumentContracts) {
  var optionsOnly = false;
  __.each(argumentContracts, function (c, i) {
    if (optionsOnly && !c.isOptional) {
      throw new ContractLibraryError('fun', false, "The non-optional "+i+"th arguments cannot follow an optional arguments.");
    }

    optionsOnly = optionsOnly || c.isOptional;
  });
}

function checkOptionalArgumentCount(argumentContracts, extraArgumentContract, actuals, context) {
  var nOptional = __.size(__.filter(argumentContracts, function (c) { return c.isOptional; }));
  var nRequired = __.size(argumentContracts) - nOptional;

  if (nOptional === 0 && !extraArgumentContract) {
    
    if (actuals.length !== nRequired) {
      context.fail(new ContractError
                   (context, "Wrong number of arguments, expected " + nRequired + " but got " + actuals.length)
                   .fullContract());
    }
    
  } else if (actuals.length < nRequired) {
    context.fail(new ContractError
                 (context, "Too few arguments, expected at least " + nRequired + " but got " + actuals.length)
                 .fullContract());

  } else if (!extraArgumentContract && 
             actuals.length > nRequired + nOptional) {
    context.fail(new ContractError
                 (context, "Too many arguments, expected at most " + (nRequired + nOptional) + " but got " + actuals.length)
                 .fullContract());
  }
}

function fnHelper(who, argumentContracts) {
  var self = new Contract(who);
  self.argumentContracts = argumentContracts;
  checkOptionalArgumentFormals(who, self.argumentContracts);

  self.isFunctionContract = true;
  self.extraArgumentContract = false;
  self.thisContract = any;
  self.resultContract = any;
  self.firstChecker = function (data) { var self = this; return __.isFunction(data); };
  self.wrapper = function (fn, next, context) {
    var self = this;

    var r = function (/* ... */) {
      var contextHere = clone(context);
      contextHere.stack = clone(context.stack);
      contextHere.thingName = self.thingName || contextHere.thingName;
      var reverseBlame = function(r) { if (r) contextHere.blameMe = !contextHere.blameMe; }

      reverseBlame(true);
      checkOptionalArgumentCount(self.argumentContracts, self.extraArgumentContract, arguments, contextHere);
      reverseBlame(true);
      var next = function(nextContract, nextV, nextContext, rb) {
        contextHere.stack.push(nextContext);
        reverseBlame(rb);
        var result = checkWrapWContext(nextContract, nextV, contextHere);
        reverseBlame(rb);
        contextHere.stack.pop();
        return result;
      };

      var wrappedThis = next(self.thisContract, this, stackContextItems.this, true);
      var wrappedArgs = 
        __.map(__.zip(self.argumentContracts, __.toArray(arguments).slice(0, self.argumentContracts.length)), function(pair, i) {
          return next(pair[0], pair[1], stackContextItems.argument(pair[0].thingName ? pair[0].thingName : i), true);
        });
      var extraArgs = (!self.extraArgumentContract ? [] :
                       next(self.extraArgumentContract, __.toArray(arguments).slice(self.argumentContracts.length), 
                            stackContextItems.extraArguments, true));

      var result = fn.apply(wrappedThis, wrappedArgs.concat(extraArgs));
      return next(self.resultContract, result, stackContextItems.result, false);
    };
    return r;


  };
  self.extraArgs = function(c) { 
    c = c || exports.any;
    var self = this; return gentleUpdate(self, { extraArgumentContract: c }); 
  };
  self.needsWrapping = true;
  self.ths = function (c) { var self = this; return gentleUpdate(self, { thisContract: c }); };
  self.returns = function (c) { var self = this; return gentleUpdate(self, { resultContract: c}); };
  self.toString = function () { 
    var self = this; 
    return "c." + self.contractName + "(" +
      (self.thisContract !== any ? "this: " + self.thisContract + ", " : "") +
      self.argumentContracts.join(", ") + 
      (self.extraArgumentContract ? "..." + self.extraArgumentContract : "") +
      " -> " + self.resultContract + ")";
  };
  return self;
}

function fn(/* ... */) {
  return fnHelper('fn', __.toArray(arguments));
}
exports.fn = fn;


function funHelper(who, argumentContracts) {

  __.each(argumentContracts, function (argSpec, i) {
    if (!__.isObject(argSpec)) 
      throw new ContractLibraryError
    (who, false,
     "expected an object with exactly one field to specify the name of the " +ith(i)+
     " argument, but got " + stringify(argSpec));

    if (argSpec instanceof Contract)
      throw new ContractLibraryError
    (who, false, 
     "expected a one-field object specifying the name and the contract of the "+ith(i)+
     " argument, but got a contract " + argSpec);
      
    var s = __.size(__.keys(argSpec));
    if (s !== 1) 
      throw new ContractLibraryError(who, false, "expected exactly one key to specify the name of the "+ith(i)+
                                     " arguments, but got " + stringify(s));
    
  });
  var contracts = __.map(argumentContracts, function(singleton) {
    var name = __.keys(singleton)[0];
    var contract = singleton[name];
    
    return gentleUpdate(contract, { thingName: name });
  });

  var toString = function () { 
    var self = this; 

    var argumentStrings =
      __.map(self.argumentContracts, function (c) {
        return '{ ' + c.thingName + ': ' + c.toString() + ' }';
      });

    return "c." + self.contractName + "(" +
      (self.thisContract !== any ? "this: " + self.thisContract + ", " : "") +
      argumentStrings.join(', ') +
      (self.extraArgumentContract ? "..." + self.extraArgumentContract : "") +
      " -> " + self.resultContract + ")";
  };

  return gentleUpdate(fnHelper('fun', contracts), { contractName: 'fun', 
                                                    toString: toString
                                                  });

}

function fun(/*...*/) {
  return funHelper('fun', __.toArray(arguments));
}
exports.fun = fun;

function method(ths /* ... */) {
  if (!(ths instanceof Contract))
    throw new ContractLibraryError('method', false, "expected a Contract for the `this` argument, by got " + stringify(ths));
  return gentleUpdate(funHelper('method', __.toArray(arguments).slice(1)).ths(ths),
                      { contractName: 'method' });
}
exports.method = method;


//---
//
// Relevant utility functions
//

function fromExample(v, withQuestionMark) {
  if (__.isArray(v)) {
    return array(fromExample(v[0]));

  } else if (__.isObject(v)) {
    var result = {};
    __.each(v, function(vv, k) { 
      var c = fromExample(vv);
      if (withQuestionMark && /^\?/.test(k)) {
      } else {
        result[k] = c;
      }
    });
    return object(result);

  } else if (__.isString(v)) {
    return string;
    
  } else if (__.isNumber(v)) {
    return number;

  } else if (__.isBoolean(v)) {
    return bool;

  } else if (__.isRegExp(v)) {
    regexp(v);

  } else if (__.isFunction(v)) {
    return anyFunction;

  } else {
    throw new ContractLibraryError('fromExample', false, "can't create a contract from " + v);
  }

}
exports.fromExample = fromExample;

var documentationTable = {};

exports.documentationTable = documentationTable;

function ensureDocumentationTable(moduleName) {
  moduleName = (__.isUndefined(moduleName) ? false : moduleName);

  if (!documentationTable[moduleName]) 
    documentationTable[moduleName] = { doc: [], categories: [], types: {}, values: {}};

  return moduleName;
}

function documentModule(moduleName /* ... */) {
  moduleName = ensureDocumentationTable(moduleName);

  documentationTable[moduleName].doc =
    documentationTable[moduleName].doc.concat(__.toArray(arguments).slice(1));
} 
exports.documentModule = documentModule;

function documentCategory(moduleName, category /*...*/) {
  moduleName = ensureDocumentationTable(moduleName);

  currentCategory = category;
  documentationTable[moduleName].categories.push = { name: category, doc: __.toArray(arguments).slice(2) };
}
exports.documentCategory = documentCategory;

function documentType(moduleName, contract) {
  if (__.contains(builtInContractNames, contract.contractName))
    throw new ContractLibraryError('`documentType` called on a contract that still has its built-in name.');

  moduleName = ensureDocumentationTable(moduleName);

  if (documentationTable[moduleName].types[contract.contractName]) 
    throw new ContractLibraryError('`documentType` called with a contract whose name that is already documented: ' + contract);

  documentationTable[moduleName].types[contract.contractName] = contract;
}
exports.documentType = documentType;

function publish(moduleName, self, contracts, /*opt*/ additionalExports) {
  moduleName = ensureDocumentationTable(moduleName);

  var result = (additionalExports ? clone(additionalExports) : {});
  __.each(contracts, function (c, n) {
    if (!__.has(self, n))
      throw new ContractLibraryError('publish', false, n + " is missing in the implementation");
    documentationTable[moduleName].values[n] = c;
    result[n] = c.wrap(self[n], n);
  });
  return result;
}
exports.publish = publish;

exports.c = exports;

collectingBuiltInContractNames = false;

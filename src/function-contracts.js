// -*- js-indent-level: 2 -*-
"use strict";

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint eqeqeq:true, bitwise:true, forin:true, immed:true, latedef:true, newcap:true, undef:true, strict:false, node:true, loopfunc:true, latedef:false */

var util = require('util');
var _ = require('underscore');
var u = require('./utils');
var c = require('./contract.impl');
var errors = require('./contract-errors');

function checkOptionalArgumentFormals(who, argumentContracts) {
  var optionsOnly = false;
  _.each(argumentContracts, function (c, i) {
    if (optionsOnly && !c.isOptional) {
      throw new errors.ContractLibraryError('fun', false, "The non-optional "+i+"th arguments cannot follow an optional arguments.");
    }

    optionsOnly = optionsOnly || c.isOptional;
  });
}

function checkOptionalArgumentCount(argumentContracts, extraArgumentContract, actuals, context) {
  var nOptional = _.size(_.filter(argumentContracts, function (c) { return c.isOptional; }));
  var nRequired = _.size(argumentContracts) - nOptional;

  if (nOptional === 0 && !extraArgumentContract) {

    if (actuals.length !== nRequired) {
      context.fail(new errors.ContractError
                   (context, "Wrong number of arguments, expected " + nRequired + " but got " + actuals.length)
                   .fullContract());
    }

  } else if (actuals.length < nRequired) {
    context.fail(new errors.ContractError
                 (context, "Too few arguments, expected at least " + nRequired + " but got " + actuals.length)
                 .fullContract());

  } else if (!extraArgumentContract &&
             actuals.length > nRequired + nOptional) {
    context.fail(new errors.ContractError
                 (context, "Too many arguments, expected at most " + (nRequired + nOptional) + " but got " + actuals.length)
                 .fullContract());
  }
}

function fnHelper(who, argumentContracts) {
  var self = new c.privates.Contract(who);
  self.argumentContracts = argumentContracts;
  checkOptionalArgumentFormals(who, self.argumentContracts);

  self.isFunctionContract = true;
  self.extraArgumentContract = false;
  self.thisContract = c.any;
  self.resultContract = c.any;
  self.firstChecker = _.isFunction;
  self.wrapper = function (fn, next, context) {
    var self = this;

    if (!context.thingName) {
      context.thingName = u.functionName(fn);
    }

    var r = function (/* ... */) {
      var contextHere = u.clone(context);
      contextHere.stack = u.clone(context.stack);
      contextHere.thingName = self.thingName || contextHere.thingName;
      var reverseBlame = function(r) { if (r) contextHere.blameMe = !contextHere.blameMe; };

      reverseBlame(true);
      checkOptionalArgumentCount(self.argumentContracts, self.extraArgumentContract, arguments, contextHere);
      reverseBlame(true);
      var next = function(nextContract, nextV, nextContext, rb) {
        contextHere.stack.push(nextContext);
        reverseBlame(rb);
        var result = c.privates.checkWrapWContext(nextContract, nextV, contextHere);
        reverseBlame(rb);
        contextHere.stack.pop();
        return result;
      };

      var wrappedThis = next(self.thisContract, this, errors.stackContextItems['this'], true);
      var wrappedArgs =
        _.map(_.zip(self.argumentContracts, _.toArray(arguments).slice(0, self.argumentContracts.length)), function(pair, i) {
          return next(pair[0], pair[1], errors.stackContextItems.argument(pair[0].thingName ? pair[0].thingName : i), true);
        });
      var extraArgs = (!self.extraArgumentContract ? [] :
                       next(self.extraArgumentContract, _.toArray(arguments).slice(self.argumentContracts.length),
                            errors.stackContextItems.extraArguments, true));

      var result = fn.apply(wrappedThis, wrappedArgs.concat(extraArgs));
      return next(self.resultContract, result, errors.stackContextItems.result, false);
    };

    if (fn.prototype) {
      r.prototype = fn.prototype;
    }

    return r;


  };
  self.extraArgs = function(contract) {
    contract = contract || c.any;
    var self = this; return u.gentleUpdate(self, { extraArgumentContract: contract });
  };
  self.needsWrapping = true;
  self.thisArg = function (contract) { var self = this; return u.gentleUpdate(self, { thisContract: contract }); };
  self.ths = self.thisArg; // for backward compatibility
  self.returns = function (contract) { var self = this; return u.gentleUpdate(self, { resultContract: contract }); };

  self.constructs = function (prototypeFields) {
    var self = this;

    var oldWrapper = self.wrapper;

    return u.gentleUpdate(self, {

      nestedChecker: function (data, next, context) {
        var self = this;

        var missing = [];
        for(var k in prototypeFields) {
            if (data.prototype[k] === undefined) {
                missing.push(k);
            }
        }

        if (missing.length) {
          var msg =
              util.format("constructs: some fields present in %s prototype contract are missing on the prototype: %s",
                          self.thingName ? util.format("%s's", self.thingName) : "the",
                          missing.join(', '));

          context.fail(new errors.ContractError(context, msg).fullContract());
        }
      },

      wrapper: function (fn, next, context) {
        var self = this;

        // Here we are reusing the normal function wrapper function.
        // In order to do, we disable the `resultContract` since the normal wrapped
        // does not check results according to constructor-invocation semantics.
        // The actual result check is done below.
        var wrappedFnWithoutResultCheck = oldWrapper.call(u.gentleUpdate(self, { resultContract: c.any }), fn, next, context);

        var WrappedConstructor = function (/* ... */) {
          var contextHere = u.clone(context);
          contextHere.stack = u.clone(context.stack);
          contextHere.thingName = self.thingName || contextHere.thingName;

          var receivedResult = wrappedFnWithoutResultCheck.apply(this, arguments);
          contextHere.stack.push(errors.stackContextItems.result);

          // Constructor semantic according to the JavaScript standard,
          // cf. http://stackoverflow.com/a/1978474/35902
          var resultToCheck;
          if (_.isObject(receivedResult)) {
            resultToCheck = receivedResult;
          } else {
            resultToCheck = this;
          }
          var result = c.privates.checkWrapWContext(self.resultContract, resultToCheck, contextHere);
          contextHere.stack.pop();
          return result;
        };

        WrappedConstructor.prototype = Object.create(fn.prototype);

        // Recreate the constructor field, cf. https://github.com/getify/You-Dont-Know-JS/blob/master/this%20&%20object%20prototypes/ch5.md
        Object.defineProperty(WrappedConstructor.prototype, "constructor" , {
          enumerable: false,
          writable: true,
          configurable: true,
          value: fn
        });

        var newThisContract = c.isA(fn);
        _.each(prototypeFields, function (contract, k) {
          var freshContext = _.clone(context);
          freshContext.thingName = k;
          if (contract.thisContract === c.any) {
            // Functions with no specified `thisContract` are assumed to be methods
            // and given a `thisContract`
            contract = u.gentleUpdate(contract, { thisContract: newThisContract });
          }
          WrappedConstructor.prototype[k] = c.privates.checkWrapWContext(contract, WrappedConstructor.prototype[k], freshContext);
        });

        return WrappedConstructor;
      }
    });


  };

  self.toString = function () {
    var self = this;
    return "c." + self.contractName + "(" +
      (self.thisContract !== c.any ? "this: " + self.thisContract + ", " : "") +
      self.argumentContracts.join(", ") +
      (self.extraArgumentContract ? "..." + self.extraArgumentContract : "") +
      " -> " + self.resultContract + ")";
  };
  return self;
}

function fn(/* ... */) {
  return fnHelper('fn', _.toArray(arguments));
}
exports.fn = fn;


function funHelper(who, argumentContracts) {

  _.each(argumentContracts, function (argSpec, i) {
    if (!_.isObject(argSpec))
      throw new errors.ContractLibraryError
    (who, false,
     "expected an object with exactly one field to specify the name of the " + u.ith(i) +
     " argument, but got " + u.stringify(argSpec));

    if (u.isContractInstance(argSpec))
      throw new errors.ContractLibraryError
    (who, false,
     "expected a one-field object specifying the name and the contract of the "+ u.ith(i) +
     " argument, but got a contract " + argSpec);

    var s = _.size(_.keys(argSpec));
    if (s !== 1)
      throw new errors.ContractLibraryError(who, false, "expected exactly one key to specify the name of the "+ u.ith(i) +
                                     " arguments, but got " + u.stringify(s));

  });
  var contracts = _.map(argumentContracts, function(singleton) {
    var name = _.keys(singleton)[0];
    var contract = c.privates._autoToContract(singleton[name]);

    return u.gentleUpdate(contract, { thingName: name });
  });

  var toString = function () {
    var self = this;

    var argumentStrings =
      _.map(contracts, function (c) {
        return '{ ' + c.thingName + ': ' + c.toString() + ' }';
      });

    return "c." + self.contractName + "(" +
      (self.thisContract !== c.any ? "this: " + self.thisContract + ", " : "") +
      argumentStrings.join(', ') +
      (self.extraArgumentContract ? "..." + self.extraArgumentContract : "") +
      " -> " + self.resultContract + ")";
  };

  return u.gentleUpdate(fnHelper('fun', contracts), { contractName: 'fun',
                                                    toString: toString
                                                  });

}

function fun(/*...*/) {
  return funHelper('fun', _.toArray(arguments));
}
exports.fun = fun;

function method(ths /* ... */) {
  if (!u.isContractInstance(ths))
    throw new errors.ContractLibraryError('method', false, "expected a Contract for the `this` argument, by got " + u.stringify(ths));
  return u.gentleUpdate(funHelper('method', _.toArray(arguments).slice(1)).thisArg(ths),
                      { contractName: 'method' });
}
exports.method = method;

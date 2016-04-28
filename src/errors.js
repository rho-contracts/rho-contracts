var _ = require('underscore');
var u = require('./utils');
var grabStack = require('callsite');

//--
//
// Stack context items
//

var stackContextItems = {
  argument: function (arg) {
    return { 'short': (_.isNumber(arg) ? ".arg("+arg+")" : "."+arg),
             'long': "for the " + (_.isNumber(arg) ? u.ith(arg) : "`"+arg+"`") + " argument of the call." };
  },

  'this': { 'short': ".this",
            'long': "for the `this` argument of the call."},

  result: { 'short': ".result",
            'long': "for the return value of the call." },

  extraArguments: { 'short': ".extraArguments",
                    'long': "for the extra argument array of the call" },

  and: function(i) {
    return { 'short': ".and("+i+")",
             'long': "for the " + u.ith(i) + " branch of the `and` contract" };
  },

  or: function(i) {
    return { 'short': ".or" };
  },

  arrayItem: function (i) {
    return { 'short': "["+i+"]",
             'long': "for the " + u.ith(i) + " element of the array",
             i: i };
  },

  tupleItem: function (i) {
    return { 'short': "["+i+"]",
             'long': "for the " + u.ith(i) + " element of the tuple" };
  },

  hashItem: function (k) {
    return { 'short': "." + k,
             'long': "for the key `" + k + "` of the hash" };
  },

  objectField: function (f) {
    return { 'short': "." + f,
             'long': "for the field `" + f + "` of the object" };
  },

  silent: { 'short': "", 'long': "" } // .silent is special, tested with === in `checkWContext`

};
exports.stackContextItems = stackContextItems;

//--
//
// Error classes
//


function cleanStack(stack) {
  stack = u.clone(stack);
  stack.shift();
  var irrelevantFileNames = [ /\/contract.js$/, /\/contract.impl.js$/, /\/function-contracts.js$/,
                              /rho-contracts.js\/index.js$/, /\/underscore.js$/,
                              /^native array.js$/, /^module.js$/, /^native messages.js$/, /^undefined$/ ];
  while(!_.isEmpty(stack)) {
    if (_.any(irrelevantFileNames, function (r) {
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
exports.captureCleanStack = captureCleanStack;

function prettyPrintStack(stack) {
  return _.map(stack, function(callsite) {
    return "  at " + callsite.getFunctionName() +
          " (" + callsite.getFileName() + ":" + callsite.getLineNumber() + ":" + callsite.getColumnNumber() + ")";
  }).join('\n');
}

function ContractError(/*opt*/ context, /*opt*/ msg) {
  Error.call(this, msg);

  this.name = 'ContractError';
  this.context = context;
  this.message = '';

  var hasBlame = this.context && this.context.thingName;
  if (hasBlame) this.blame(context);
  if (hasBlame && msg) this.message += ' ';
  if (msg) this.message += msg;
  if (hasBlame || msg) this.message += "\n";

  if (this.context && this.context.wrappedAt && this.context.wrappedAt[0]) {
    var callsite = this.context.wrappedAt[0];
    this.message += "(contract was wrapped at: " + callsite.getFileName() +":"+callsite.getLineNumber() +")\n";
  }
}

ContractError.prototype = _.extend(Object.create(Error.prototype), {

  captureCleanStack: function () {
    var self = this;
    self.renderedStack = prettyPrintStack(captureCleanStack());
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
      self.message += "check on `" + thingNameWithParens + "` failed:";
    } else if (self.context.blameMe) {
      self.message += "`" + thingNameWithParens + "` broke its contract:";
    } else {
      self.message += "broke the contract on `" + thingNameWithParens + "`:";
    }
  },

  expected: function(expected, data, /*opt*/ context) {
    var self = this;

    self.context = context || self.context;
    self.expected = expected;
    self.data = data;
    self.message += "Expected " + expected + ", but got " + u.stringify(data) + "\n";
    return self;
  },

  fullValue: function(/*opt*/ context) {
    var self = this;

    self.context = context || self.context;
    if (!_.isFunction(self.context.data))    // Don't bother printing functions,
      if (!self.expected ||                   // if expected() has not already printed the value
          !_.isEmpty(self.context.stack))    // or there is a stack, so expected() has printed only
        //                                       a small piece of the value.
        self.message += "The full value being checked was:\n" + u.stringify(self.context.data) + "\n";
    return self;
  },

  fullContract: function (/*opt*/ context) {
    var self = this;

    self.context = context || self.context;

    if (!_.isEmpty(self.context.stack)) {
      var stack = self.context.stack;
      var immediateContext = _.last(stack);

      if (stack[stack.length-2] === stackContextItems.extraArguments) {
        // Special case for error messages of extra arguments
        // Invariant: the immediate context is always a stackContextItems.arrayItem,
        // which always hash a `i` field

        self.message += "for the " + u.ith(immediateContext.i) + " extra argument of the call.\n";
        stack = stack.slice(0, -2);

      } else if (immediateContext['long']) {
        self.message += immediateContext['long'] +"\n";
        stack = stack.slice(0, -1);
      }

      if (!_.isEmpty(stack)) {
        var stackStrings = _.map(stack, function(i) { return (i['short'] ? i['short'] : i); });
        self.message += ("at position " + stackStrings.join("") +"\n"+
                         "in contract:\n" + self.context.contract.toString() + "\n");
      }
    }
    return self;
  },

  fullContractAndValue: function (/*opt*/ context) {
    var self = this;

    self.fullContract(context);
    self.fullValue(context);
    return self;
  }
});
ContractError.prototype.constructor = ContractError;
exports.ContractError = ContractError;

function ContractLibraryError(fnName, /*opt*/ context, /*opt*/ msg) {
  ContractError.call(this, context, msg);
  this.name = 'ContractLibraryError';
  this.functionName = fnName;
  this.message = fnName + ": " + this.message;
  this.captureCleanStack();
}
ContractLibraryError.prototype = Object.create(ContractError.prototype);
ContractLibraryError.prototype.constructor = ContractLibraryError;

exports.ContractLibraryError = ContractLibraryError;

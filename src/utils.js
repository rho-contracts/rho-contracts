var _ = require('underscore');
var util = require('util');

var contractSignal = "M`okY\\xtXVmQzw5dfjjhkDM|Z9@hGy";

function isContractInstance(v) {

  // Instead of doing `v instanceof Contract`, a value is considered a
  // contract iff `v.signal === Contract.prototype.signal`, where
  // `signal` is a short constant random string. The signal check is
  // slightly more reliable. With the `instanceof` check, a situation
  // where two different versions of the contract library are
  // installed make the check fail, which result in throughly puzzling
  // contract errors.

 return v && v.signal === contractSignal;
}

function isMissing(v) {
  return _.isUndefined(v) || v === null;
}

function clone(obj) {
  var other = _.clone(obj);
  other.__proto__ = obj.__proto__;
  return other;
}

function gentleUpdate(obj, spec) { // aka, not an imperative update. aka, no bang.
  var other = clone(obj);
  _.each(spec, function(v, k) { other[k] = v; });
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

var errorMessageInspectionDepth = 5;

function setErrorMessageInspectionDepth(depth) {
  errorMessageInspectionDepth = depth;
};

function stringify(v) {
  if (isContractInstance(v)) {
    return v.toString();
  } else {
    return util.inspect(v, false, errorMessageInspectionDepth, false);
  }
}


function functionName(fn) {
    var match = fn.toString().match(/function ([^\(]+)/);
    if (match) {
        return match[1].trim();
    } else {
        return null;
    }
};

module.exports = {
    contractSignal: contractSignal,
    isContractInstance: isContractInstance,
    isMissing: isMissing,
    clone: clone,
    gentleUpdate: gentleUpdate,
    ith: ith,
    stringify: stringify,
    setErrorMessageInspectionDepth: setErrorMessageInspectionDepth,
    functionName: functionName
}

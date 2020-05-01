'use strict'

const _ = require('underscore')
const util = require('util')

const contractSignal = 'M`okY\\xtXVmQzw5dfjjhkDM|Z9@hGy'

function isContractInstance(v) {
  // Instead of doing `v instanceof Contract`, a value is considered a
  // contract iff `v.signal === Contract.prototype.signal`, where
  // `signal` is a short constant random string. The signal check is
  // slightly more reliable. With the `instanceof` check, a situation
  // where two different versions of the contract library are
  // installed make the check fail, which result in throughly puzzling
  // contract errors.

  return v && v.signal === contractSignal
}

function isMissing(v) {
  return _.isUndefined(v) || v === null
}

function clone(obj) {
  const other = _.clone(obj)
  Object.setPrototypeOf(other, Object.getPrototypeOf(obj))
  return other
}

function gentleUpdate(obj, spec) {
  // aka, not an imperative update. aka, no bang.
  const other = clone(obj)
  _.each(spec, function (v, k) {
    other[k] = v
  })
  return other
}

function ith(i) {
  i++
  switch (i % 10) {
    case 1:
      return `${i}st`
    case 2:
      return `${i}nd`
    case 3:
      return `${i}rd`
    default:
      return `${i}th`
  }
}

let errorMessageInspectionDepth = 5

function setErrorMessageInspectionDepth(depth) {
  errorMessageInspectionDepth = depth
}

function stringify(v) {
  if (isContractInstance(v)) {
    return v.toString()
  } else {
    return util.inspect(v, false, errorMessageInspectionDepth, false)
  }
}

function functionName(fn) {
  const match = fn.toString().match(/function ([^(]+)/)
  if (match) {
    return match[1].trim()
  } else {
    return null
  }
}

module.exports = {
  contractSignal,
  isContractInstance,
  isMissing,
  clone,
  gentleUpdate,
  ith,
  stringify,
  setErrorMessageInspectionDepth,
  functionName,
}

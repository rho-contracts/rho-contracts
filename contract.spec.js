//  -*- js-indent-level: 2 -*-
"use strict";

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint eqeqeq:true, bitwise:true, forin:true, immed:true, latedef: true, newcap: true undef: true, strict: true */
/*global exports, require, describe, it */

var should = require('should');
var __ = require('underscore');
var c = require('./contract.face');

Array.prototype.toString = function () {
  return "[" + this.join(", ") + "]";
};

var oldToString = Object.prototype.toString;
Object.prototype.toString = function () {
  var that = this;
  if (__.isObject(that))
    return "{ " + __.chain(that).keys().map(function (k) { return k+": " + that[k];}).value().join(", ") + " }";
  else return oldToString.call(that);
};

should.Assertion.prototype.throwError = function (message) {
  this.throw(message);
};

should.Assertion.prototype.throwContract = function (message) {
  this.throwType(c.ContractError, message);
};

should.Assertion.prototype.throwType = function(type, message){
  var fn = this.obj, err = {} , errorInfo = '' , caught, ok;

  try {
    var v = fn();
    caught = false;
    ok = false;
    errorInfo = "but the function returned " + v;
  } catch (e) {
    err = e;
    caught = true;
  }

  if (caught) {
    //console.log('\ncontracts/contract.spec.js Line 49:\n'+err+'\n'+err.renderedStack+'\n\n');
    if (err.name !== type.name) {
      ok = false;
      errorInfo = "but the error was " + err;
    } else if (!message) {
      ok = true;
    } else if (typeof message === 'string') {
      ok = message === err.message;
      errorInfo = "with a message exactly '" + message + "', but got '" + err.message + "'";
    } else if (message instanceof RegExp) {
      ok = message.test(err.message);
      errorInfo = "with a message matching " + message + "', but got '" + err.message + "'";
    } else {
      throw new Error("should.throw expects a string or a regexp");
    }
  }

  this.assert(
    ok,
    function () { return 'expected a ' + type.name + ' to be thrown ' + errorInfo },
    function () { return 'expected no ' + type.name + ' to be thrown, got "' + err.message + '"' });

  return this;
};

describe ("toContract", function () {
  it ("passes contracts", function () { c.toContract(c.any).contractName.should.eql(c.any.contractName); });
  it ("wrap objects", function () { c.toContract({}).should.be.an.instanceof(c.Contract); } );
  it ("wrap objects recursively", function () {
    var kidPark = c.toContract({
      name: c.string,
      acres: c.number,
      playunit: {
        junglebars: c.bool,
        slides: c.number,
        ladders: [{
          color: c.string,
          size: c.string
        }]
      }
    });

    var example = {
      name: "corner park",
      acres: 0.1,
      playunit: {
        junglebars: true,
        slides: 3,
        ladders: [{
          color: "red",
          size: "large"
        }, {
          color: "yellow",
          size: "medium"
        },]
      }
    }
    kidPark.check(example).should.be.eql(example);
    example.playunit.ladders[1].size = 0;
    (function () { kidPark.check(example) }).should.throwContract(/Expected string/);
  });
  it ("wraps arrays", function () { c.toContract([c.any]).should.be.an.instanceof(c.Contract); });
  it ("wraps values", function () { c.toContract(5).contractName.should.be.eql(c.value(5).contractName); });
});

describe ("any", function () {
  it ("pass 5", function () { c.any.check(5).should.eql(5); });
});

describe ("nothing", function () {
  it ("rejects 5", function () { (function () { c.nothing.check(5); }).should.throwContract(); });
  it ("report check name", function () { (function () { c.nothing.wrap(5, 'test'); }).should.throwContract(/test/); });
});

describe ("value", function () {
  it ("pass same", function () { c.value(5).check(5).should.eql(5); });
  it ("reject different", function () { (function () { c.value(5).check(6); }).should.throwContract(); });
});

describe ("string", function () {
  it ("pass string", function () { c.string.check("asd").should.eql("asd"); });
  it ("reject different", function () { (function () { c.string.check(6); }).should.throwContract(); });
});

describe ("Date", function () {
  it ("pass Date", function () { c.date.check(new Date()).should.ok; });
  it ("reject different", function () { (function () { c.date.check(6); }).should.throwContract(); });
});

describe("pred", function () {
  it ("returns a contract", function () { c.pred(function(v) { return false; }).should.instanceof(c.Contract); });
});

describe ("and", function () {
  it ("passes two", function () { c.and(c.string, c.value("asd")).check("asd").should.eql("asd"); });
  it ("fails first", function () { (function () { c.and(c.string, c.value("asd")).check(5); }).should.throwContract(); });
  it ("fails second", function () { (function () { c.and(c.string, c.value("asd")).check("aaa"); }).should.throwContract(); });
});

describe ("or", function () {
  it ("passes first", function () { c.or(c.string, c.value(6)).check("asd").should.eql("asd"); });
  it ("passes second", function () { c.or(c.string, c.value(6)).check(6).should.eql(6); });
  it ("fails", function () { (function () { c.or(c.string, c.value(6)).check(0); }).should.throwContract(); });
  it ("two fn cannot be wrapped", function () { (function () { c.or(c.fn(), c.fn())
                                                               .wrap(function () {}, function () {}); })
                                                .should.throwError(/at most one/); });
});

describe ("matches", function () {
  it ("passes", function () { c.matches(/x+/).check("---xxxxx  ").should.ok; });
  it ("fail", function () { (function () { c.matches(/x+/).check("---  "); }).should.throwContract(); });
});

describe ("array", function () {
  it ("fails non-arrays", function () { (function () { c.array(c.any).check(5); }).should.throwContract(); });
  it ("passes empty", function () { c.array(c.any).check([]).should.eql([]); });
  it ("passes simple", function () { c.array(c.value(5)).check([5, 5]).should.eql([5, 5]); });
  it ("fails first", function () { (function () { c.array(c.value(5)).check([10, 5]); }).should.throwContract(); });
  it ("fails second", function () { (function () { c.array(c.value(5)).check([5, 10]); }).should.throwContract(); });
  it ("passes nested", function () { c.array(c.array(c.value(5))).check([[5], [5, 5]]).should.ok; });
  it ("fails nested", function () { (function () { c.array(c.array(c.value(5))).check([[5], [5, 10]]); }).should.throwContract(); });
});

describe ("tuple", function () {
  it ("fails non-arrays", function () { (function () { c.tuple(c.any).check(5); }).should.throwContract(); });
  it ("fails empty", function () { (function () { c.tuple(c.any).check([]); }).should.throwContract(); });
  it ("passes simple", function () { c.tuple(c.value(5), c.value(10)).check([5, 10]).should.eql([5, 10]); });
  it ("passes longer", function () { c.tuple(c.value(5), c.value(10)).check([5, 10, "x"]).should.eql([5, 10, "x"]); });
  it ("fails first", function () { (function () { c.tuple(c.value(5), c.value(10)).check([10, 5]); }).should.throwContract(); });
  it ("fails second", function () { (function () { c.tuple(c.value(5), c.value(10)).check([5, 20]); }).should.throwContract(); });
  it ("passes nested", function () { c.tuple(c.string, c.tuple(c.value(5), c.string), c.number).check(["a", [5, "b"], 5]).should.ok; });
  it ("fails nested", function () { (function () { c.tuple(c.string, c.tuple(c.value(5), c.string), c.number).check(["a", [5, 10], 5]); })
                                    .should.throwContract(); });
});

describe ("hash", function () {
  it ("passes", function () { c.hash(c.string).check({x:"aaa", y:"bbb"}).should.eql({x:"aaa", y:"bbb"}); });
  it ("fails", function () { (function () { c.hash(c.string).check({x:"aaa", y:5}); }).should.throwContract(); });
  it ("wrap wraps fields and fails", function () {
    (function () {
      var x = {thk:function(){}};
      c.hash(c.fn()).wrap(x).thk(5);
    }).should.throwContract(/Wrong number/);
  });

});

describe ("object regression", function () {
  it ("one wrapping field and one non-wrapping field",
      function () {
        c.object({x: c.string, fn: c.fn()}).wrap({x:"foo", fn: function () {}}).x.should.eql('foo'); });
});


describe ("object", function () {
  it ("fails non-objects", function () { (function () { c.object().check(5); }).should.throwContract(); });
  it ("passes empty", function () { c.object().check({}).should.eql({}); });
  it ("passes simple", function () { c.object({x: c.value(5)}).check({x: 5}).should.eql({x: 5}); });
  it ("fails first", function () { (function () { c.object({x: c.value(5), y: c.value(10)}).check({ x: 10, y:10}); }).should.throwContract(); });
  it ("fails second", function () { (function () { c.object({x: c.value(5), y: c.value(10)}).check({ x: 5, y:2}); }).should.throwContract(); });
  it ("passes nested", function () { c.object({x: c.object({y: c.value(5)})}).check({x: {y: 5}}).should.ok; });
  it ("fails nested", function () { (function () { c.object({x: c.object({y: c.value(5)})}).check({x: { y: 10}}); }).should.throwContract(); });
  it ("fails missing field", function () { (function () { c.object({x: c.value(5), y:c.value(10)}).check({ x: 5, z: 10}); }).should.throwContract(); });
  it ("fails missing field, nested", function () { (function () { c.object({x: c.object({y: c.value(5)})}).check({x: { z: 10}}); }).should.throwContract(); });

  it ("optional field missing", function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({x: 5}).should.ok; });
  it ("optional field, passing", function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({x: 5, y:10}).should.ok; });
  it ("optional field, failing", function () { (function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({ x: 5, y:5}); }).should.throwContract(); });
  it ("optional field, nested, failing", function () { (function () { c.object({x: c.value(5), y: c.optional(c.object({z: c.value(10)}))})
                                                                      .check({x: 5, y:{z: 0}}); })
                                                       .should.throwContract(); });

  it ("extra fields, passing", function () { c.object({x: c.value(5)}).check({x:5, y:10}).should.eql({x:5, y:10}); });
  it ("extra fields, wrapping", function () { c.object({fn: c.fn()}).wrap({fn: function () {}, x: 5}).x.should.eql(5); });

  it ("wrap wraps fields and fails", function () {
    (function () {
      var x = {thk:function(){}};
      c.object({thk:c.fn()}).wrap(x).thk(5);
    }).should.throwContract(/Wrong number/);
  });

  it ("wrap maintains prototypes", function () {
    var x = {thk:function(){}};
    x.__proto__.x = 5;
    c.object({thk:c.fn()}).wrap(x).__proto__.should.eql({x:5});
  });

  it ("extends passes", function () {
    c.object({x: c.number}).extend({y: c.string}).check({x:5, y:'asd'}).should.eql({x:5, y:'asd'});
  });
  it ("extends fails", function () {
    (function () { c.object({x: c.number}).extend({y: c.string}).check({x:5}); }).should.throwContract();
  });

});

describe ("strict", function () {
  it ("passes a good object", function () { c.object({x: c.value(10)}).strict().check({x: 10}).should.ok; });
  it ("passes a good tuple", function () { c.tuple(c.value(10)).strict().check([10]).should.ok; });
  it ("passes double strict on a good object", function () { c.object({x: c.value(10)}).strict().strict().check({x: 10}).should.ok; });
  it ("passes double strict on a good tuple", function () { c.tuple(c.value(10)).strict().strict().check([10]).should.ok; });
  it ("fails an object", function () { (function () { c.object({x: c.value(10)}).strict().check({x: 10, y:20}); }).should.throwContract(); });
  it ("fails an object's field", function () { (function () { c.object({x: c.value(10)}).strict().check({x: 20}); }).should.throwContract(); });
  it ("fails an object, multiple", function () { (function () { c.object({x: c.value(10)}).strict().check({x: 10, y:20, z:30}); }).should.throwContract(); });
  it ("fails a nested object", function () { (function () { c.object({x: c.object({y: c.value(10)}).strict() }).strict().check({x: {y: 10, z: 20}}); }).should.throwContract(); });
  it ("fails a tuple", function () { (function () { c.tuple(c.value(10)).strict().check([10, 20]); }).should.throwContract(); });
});


describe ("wrapConstructor", function () {

  function Example(x) {
    this.x = x;
  }
  Example.prototype.inc = function (i) {
    this.x += i;
  }
  Example.prototype._dec = function (i) {
    this.x -= i;
  }

  var Wrapped = c.fun({x: c.number}).wrapConstructor(Example, {
    inc: c.fun({i: c.number})
  });

  it ("creates a wrapped object", function () {
    var instance = new Wrapped(5);
    instance.should.be.instanceof(Wrapped);
    instance.x.should.eql(5);
    instance.inc(2)
    instance.x.should.eql(7);
  })

  it ("refuses wrong constructor arguments", function () {
    (function () { new Wrapped("boom") }).should.throwContract(/Example[\s\S]+argument/);
  })

  it ("produces an object that fails on bad input", function () {
    (function () { new Wrapped(5).inc("five") } ).should.throwContract(/inc()[\s\S]+number/);
  })

  it ("places fields on instances even when omitted from the contract", function () {
    var w = new Wrapped(4);
    w._dec("twenty")
    isNaN(w.x).should.be.ok;
  })

  it ("detects missing fields", function () {
    (function () {
      c.fun().wrapConstructor(function Nothing() {}, {
        inc: c.fun({i: c.number}),
        _dec: c.fun({i: c.number})
      });
    }).should.throwType(c.privates.ContractLibraryError, /are missing[\s\S]+inc, _dec/);
  })

});

describe ("fn", function () {

  var id = function(x) { return x; };
  var strId = function(x) { return "" + x; };
  var twoId = function(x, y) { return [x, y]; };
  var manyId = function (/* ... */ ) { return arguments[0]; };
  var thisId = function (x) { return this.x; };


  var idC = c.fn(c.number).returns(c.number);
  var strIdC = c.fn(c.number).returns(c.string);
  var twoIdC = c.fn(c.number, c.string).returns(c.tuple(c.number, c.string));
  var manyIdC = c.fn().extraArgs([c.number]).returns(c.number);
  var thisC = c.fn(c.number).thisArg(c.object({x: c.string})).returns(c.string);

  var oneOptC = c.fn(c.number, c.optional(c.number));

  it ("is a function", function () { idC.wrap(id).should.instanceof(Function); });
  it ("passes id(number)", function () { idC.wrap(id)(5).should.eql(5); });
  it ("passes strId(number)", function () { strIdC.wrap(strId)(10).should.eql("10"); });
  it ("passes twoId(number, string)", function () { twoIdC.wrap(twoId)(5, "x")
                                                    .should.eql([5, "x"]); });
  it ("passes manyId(num, num, str)", function () { manyIdC.wrap(manyId)(5, 7, 10).should.eql(5); });


  it ("fails on non-function", function () { (function () { idC.wrap(5); }).should.throwContract(); });
  it ("fails on wrong number of args", function () { (function () { idC.wrap(id)(5, 6); }).should.throwContract(); });
  it ("fails on input", function () { (function () { idC.wrap(id)("boo"); }).should.throwContract(); });
  it ("fails on 2nd input", function () { (function () { twoIdC.wrap(twoId)(5, 10); }).should.throwContract(); });
  it ("fails on output", function () { (function () { strIdC.wrap(id)(10); }).should.throwContract(); });
  it ("fails on extra input", function () { (function () { manyIdC.wrap(manyId)(5, 6, "boo", 7); }).should.throwContract(); });
  it ("fails on return when extra arguments", function () {(function () { manyIdC.wrap(strId)(5, 6, 7); }).should.throwContract(/for the return/);});

  it ("success on this", function () { var v = {x:"w", getX: thisC.wrap(thisId) };
                                       v.getX(4).should.eql("w"); });
  it ("fails on this", function () {(function () { var v = {x:50, getX: thisC.wrap(thisId) };
                                                   v.getX(4); }).should.throwContract(/this/); });

  it ("passes w missing opt", function () { oneOptC.wrap(twoId)(10).should.eql([10, undefined]); });
  it ("passes none missing", function () { oneOptC.wrap(twoId)(10, 20).should.eql([10, 20]); });
  it ("passes with extra", function () { oneOptC.extraArgs(c.any).wrap(twoId)(10, 20, 30).should.eql([10, 20]); });
  it ("fails too few", function () { (function () { oneOptC.wrap(twoId)(); }).should.throwContract(/few/); });
  it ("fails too many", function () { (function () { oneOptC.wrap(twoId)(10, 20, 30); }).should.throwContract(/many/); });

});


describe ("fun", function () {

  var id = function(x) { return x; };
  var strId = function(x) { return "" + x; };
  var twoId = function(x, y) { return [x, y]; };
  var manyId = function ( /* ... */ ) { return arguments[0]; };
  var thisId = function (x) { return this.x; };

  var idC = c.fun({ the_arg: c.number }).returns(c.number);
  var strIdC = c.fun({ the_arg: c.number }).returns(c.string);
  var twoIdC = c.fun({ fstArg: c.number}, { sndArg: c.string}).returns(c.tuple(c.number, c.string));
  var manyIdC = c.fun().extraArgs([c.number]).returns(c.number);
  var thisC = c.fun({y: c.number}).thisArg(c.object({x: c.string})).returns(c.string);

  it ("is a function", function () { idC.wrap(id).should.instanceof(Function); });
  it ("passes id(number)", function () { idC.wrap(id)(5).should.eql(5); });
  it ("passes strId(number)", function () { strIdC.wrap(strId)(10).should.eql("10"); });
  it ("passes twoId(number, string)", function () { twoIdC.wrap(twoId)(5, "x")
                                                    .should.eql([5, "x"]); });
  it ("passes manyId(num, num, str)", function () { manyIdC.wrap(manyId)(5, 7, 10).should.eql(5); });


  it ("fails on non-function", function () { (function () { idC.wrap(5); }).should.throwContract(/fun/); });
  it ("fails on wrong number of args", function () { (function () { idC.wrap(id)(5, 6); }).should.throwContract(/Wrong number/); });
  it ("fails on input", function () { (function () { idC.wrap(id)("boo"); }).should.throwContract(/the_arg/); });
  it ("fails on 2nd input", function () { (function () { twoIdC.wrap(twoId)(5, 10); }).should.throwContract(/sndArg/); });
  it ("fails on output", function () { (function () { strIdC.wrap(id)(10); }).should.throwContract(/for the return/); });
  it ("fails on extra input", function () { (function () { manyIdC.wrap(manyId)(5, 6, "boo", 7); }).should.throwContract(/3rd extra argument/); });
  it ("fails on return when extra arguments", function () {(function () { manyIdC.wrap(strId)(5, 6, 7); }).should.throwContract(/for the return/);});

  it ("success on this", function () { var v = {x:"w", getX: thisC.wrap(thisId, 'thisId' ) };
                                       v.getX(4).should.eql("w"); });
  it ("fails on this", function () {(function () { var v = {x:50, getX: thisC.wrap(thisId) };
                                                   v.getX(5); }).should.throwContract(/this/); });
});

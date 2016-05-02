//  -*- js-indent-level: 2 -*-
"use strict";

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint eqeqeq:true, bitwise:true, forin:true, immed:true, latedef: true, newcap: true, undef: true, strict:true, node:true */
/*global describe, it */

var should = require('should');
var __ = require('underscore');
var c = require('./contract');
var fs = require('fs');
var errors = require('./errors');

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
  this['throw'](message);
};

should.Assertion.prototype.throwContract = function (message) {
  this.throwType(errors.ContractError, message);
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
    function () { return 'expected a ' + type.name + ' to be thrown ' + errorInfo ;},
    function () { return 'expected no ' + type.name + ' to be thrown, got "' + err.message + '"'; });

  return this;
};

describe ("toContract", function () {
  it ("passes contracts", function () { c.toContract(c.any).contractName.should.eql(c.any.contractName); });
  it ("wrap objects", function () { c.toContract({}).should.be.an['instanceof'](c.Contract); } );
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
        }]
      }
    };
    kidPark.check(example).should.be.eql(example);
    example.playunit.ladders[1].size = 0;
    (function () { kidPark.check(example); }).should.throwContract(/Expected string/);
  });
  it ("wraps arrays", function () { c.toContract([c.any]).should.be.an['instanceof'](c.Contract); });
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

describe ('isA', function () {
  function ExampleImpl() { }
  it ("detects a newly constructed object", function () {
    c.isA(ExampleImpl).check(new ExampleImpl()).should.be.ok;
  });

  it ("rejects different", function () {
    (function () { c.isA(ExampleImpl).check(new Date()); } ).should.throwContract(/isA\(ExampleImpl\)/);
  });
});

describe("pred", function () {
  it ("returns a contract", function () { c.pred(function(v) { return false; }).should.be['instanceof'](c.Contract); });
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
  it ("does not coerce null", function () { (function () { c.matches(/null/).check(null); }).should.throwContract(); });
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

  describe ("option field", function () {
    it ("when missing", function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({x: 5}).should.ok; });
    it ("when null", function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({x: 5, y: null}).should.ok; });
    it ("when undefined", function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({x: 5, y: undefined}).should.ok; });
    it ("when present", function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({x: 5, y:10}).should.ok; });
    it ("rejects when mismatched", function () { (function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({ x: 5, y:5}); }).should.throwContract(); });
    it ("rejects when falsy", function () { (function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({ x: 5, y:""}); }).should.throwContract(); });
    it ("rejects when NaN", function () { (function () { c.object({x: c.value(5), y:c.optional(c.value(10))}).check({ x: 5, y:0/0}); }).should.throwContract(); });
    it ("nested and mismatched", function () { (function () { c.object({x: c.value(5), y: c.optional(c.object({z: c.value(10)}))})
                                                              .check({x: 5, y:{z: 0}}); })
                                               .should.throwContract(); });
  });

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

  it ("composes with extend", function () {
    (function () { c.object({x: c.number}).strict().extend({y: c.number}).check({x: 5}); }).should.throwContract(/required/);
    (function () { c.object({x: c.number}).strict().extend({y: c.number}).check({x: 5, y: 'asd'}); }).should.throwContract();
    (function () { c.object({x: c.number}).strict().extend({y: c.number}).check({x: 5, y: 6}); }).should.ok;
    (function () { c.object({x: c.number}).strict().extend({y: c.number}).check({x: 5, y: 6, z: 7}); }).should.throwContract(/extra field/);

    (function () { c.object({x: c.number}).extend({y: c.number}).strict().check({x: 5}); }).should.throwContract(/required/);
    (function () { c.object({x: c.number}).extend({y: c.number}).strict().check({x: 5, y: 'asd'}); }).should.throwContract();
    (function () { c.object({x: c.number}).extend({y: c.number}).strict().check({x: 5, y: 6}); }).should.ok;
    (function () { c.object({x: c.number}).extend({y: c.number}).strict().check({x: 5, y: 6, z: 7}); }).should.throwContract(/extra field/);
  });
});


describe ("constructs", function () {

  function ExampleImpl(x) {
    this.x = x;
  }
  ExampleImpl.prototype.inc = function (i) {
    this.x += i;
  };
  ExampleImpl.prototype._dec = function (i) {
    this.x -= i;
  };

  var Example = c.fun({x: c.number}).constructs({
    inc: c.fun({i: c.number})
  }).wrap(ExampleImpl);

  it ("creates a wrapped object", function () {
    var instance = new Example(5);
    instance.x.should.eql(5);
    instance.inc(2);
    instance.x.should.eql(7);
    instance.constructor.should.eql(ExampleImpl);
  });

  it ('allows `instanceof` and `isA` checks', function () {
    var instance = new Example(5);
    instance.should.be['instanceof'](Example);
    instance.should.be['instanceof'](ExampleImpl);
    c.isA(Example).check(instance).should.be.ok;
    c.isA(ExampleImpl).check(instance).should.be.ok;
  });

  it ("refuses wrong constructor arguments", function () {
    (function () { new Example("boom"); }).should.throwContract(/ExampleImpl[\s\S]+argument/);
  });

  it ("refuses incorrectly constructed objects", function () {
    var Wrap = c.fun({x: c.number}).constructs({}).returns(c.object({x: c.string}))
        .wrap(ExampleImpl);
    (function () { new Wrap(4); }).should.throwContract(/ExampleImpl[\s\S]+ string, but got 4/);
  });

  it ("produces an object that fails on bad input", function () {
    (function () { new Example(5).inc("five"); } ).should.throwContract(/inc()[\s\S]+number/);
  });

  it ("fields omitted from the contract can be used normally", function () {
    var w = new Example(4);
    w._dec("twenty");
    isNaN(w.x).should.be.ok;
  });

  it ("detects missing fields", function () {
    (function () {
      c.fun().constructs({
        inc: c.fun({i: c.number}),
        _dec: c.fun({i: c.number})
      }).wrap(function Blank() {});}).should.throwType(errors.ContractLibraryError, /are missing[\s\S]+inc, _dec/);
  });

  it ("supports returning explicitly", function () {
    var theReturnValue = {x: 5};
    var Constructor = function () { this.x = 1; return theReturnValue; };
    var Wrapped = c.fun().returns(c.object({x: c.number})).constructs({}).wrap(Constructor);
    new Wrapped().should.eql({x: 5});
    theReturnValue = undefined;
    new Wrapped().should.eql({x: 1});
    theReturnValue = "foo";
    new Wrapped().should.eql({x: 1});
    theReturnValue = 5;
    new Wrapped().should.eql({x: 1});
  });

  describe("in the presence of the prototype chain", function (){

    function SubExampleImpl(x) {
      ExampleImpl.call(this, x);
    }
    SubExampleImpl.prototype = Object.create(Example.prototype);
    SubExampleImpl.prototype.pair = function (n) {
      return [this.x, this.x];
    };
    SubExampleImpl.prototype.reset = function () {
      this.x = 0;
    };

    var SubExample = c.fun({i: c.number}).constructs({
      pair: c.fun().returns(c.array(c.number))
    }).wrap(SubExampleImpl);

    it ("produces a usable object with shared methods", function () {
      var instance = new SubExample(10);
      instance.should.have.property('pair');
      instance.should.not.have.ownProperty('pair');
      instance.should.have.property('inc');
      instance.should.not.have.ownProperty('inc');
      instance.pair().should.eql([10, 10]);
    });
    it ("allows use of methods from up the chain" , function () {
      var instance = new SubExample(10);
      instance.inc(2);
      instance.x.should.eql(12);
    });
    it ("it detects misuses of methods from up the chain", function () {
      var instance = new SubExample(10);
      (function () { instance.inc("nope"); }).should.throwContract(/number.*nope/);
      (function () { instance.pair(20); }).should.throwContract(/Wrong number of arg/);
    });
    it ("methods up the chain omitted from the contract can be used normally", function () {
      var instance = new SubExample(10);
      instance._dec(3);
      instance.x.should.eql(7);
    });
    it ("check `isA` for the `this` argument", function () {
      var instance = new SubExample(10);
      var incFn = instance.inc;
      (function () { incFn(20); }).should.throwContract(/isA\(ExampleImpl\)[\s\S]+the `this` argument/);
      (function () { incFn.call(new SubExample(5), 2, 4); }).should.ok;
      (function () { incFn.call({}, 2); }).should.throwContract(/the `this` argument/);
    });
    it ("`isA` checks on subclass refuses superclass", function () {
      var instance = new SubExample(10);
      var pairFn = instance.pair;
      (function () { pairFn.call(new Example(5)); }).should.throwContract(/isA\(SubExampleImpl\)[\s\S]+`this`/);
    });
  });

  describe('when nested inside other contracts', function () {
    var theContract = c.fun({x: c.object({
      BuildIt: c.fn().constructs({
        inc: c.fun({i: c.any}).returns(c.number)
      }).returns(c.object())
    })}, {v: c.any});

    var theFunction = function (x, v) {
      var instance = new x.BuildIt();
      return instance.inc(v);
    };

    var wrapped = theContract.wrap(theFunction);

    var TheConstructor = function () {};
    TheConstructor.prototype.inc = function (i) {
      return i + 1;
    };

    var theObject = {BuildIt: TheConstructor};

    it ('produces a usable object', function () {
      wrapped(theObject, 10).should.be.eql(11);
    });

    it ('detects misuses', function () {
      (function () { wrapped(theObject, "ten"); }).should.throwContract(/inc[\s\S]+return value of the call/);
    });

    it ('produces a short stack context on prototype function calls', function () {
      try {
        wrapped(theObject, "ten");
      } catch (e) {
        e.message.should.not.match(/at position/);
      }
    });
    it ('the truncated context retains the original wrap location', function () {
      var index =
          __.findIndex(fs.readFileSync('./src/contract.spec.js').toString().split('\n'),
                       function (line) { return line.match(/theContract.wrap\(theFunction\)/); });
      var expected = new RegExp('contract was wrapped at: .*/contract.spec.js:'+(index+1));
      (function () { wrapped(theObject, "ten"); }).should.throwContract(expected);
    });
  })
  ;
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

  it ("is a function", function () { idC.wrap(id).should.be['instanceof'](Function); });
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

  it ("is a function", function () { idC.wrap(id).should.be['instanceof'](Function); });
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

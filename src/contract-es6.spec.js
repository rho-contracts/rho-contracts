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
var errors = require('./contract-errors');

describe('c.constructs', function () {

  describe('with a class', function () {

    class ExampleImpl {
      constructor (initialValue) {
        this.value = initialValue;
      }

      inc () {
        this.value++;
      }
    }

    var theContract = c.fun({ initialValue: c.number })
      .constructs({
        inc: c.fun().returns(c.number),
      });

    var Example = theContract.wrap(ExampleImpl);

    it('can construct', function () {
      var instance = new Example(10);

      instance.value.should.be.eql(10);
    });

    it('allows `instanceof` and `isA` checks on the wrapped constructor', function () {
      var instance = new Example(5);
      instance.should.be['instanceof'](Example);
      c.isA(Example).check(instance).should.be.ok;
    });

    it('allows `instanceof` and `isA` checks on the implementation', function () {
      var instance = new Example(5);
      instance.should.be['instanceof'](ExampleImpl);
      c.isA(ExampleImpl).check(instance).should.be.ok;
    });

  });

});

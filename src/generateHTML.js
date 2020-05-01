'use strict'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const __ = require('underscore')
const fs = require('fs')
const m = require('mustache')
const c = require('./contract')
const marked = require('marked')

// eslint-disable-next-line no-unused-vars
const moduleTemplateData = {
  name: 'contract',

  doc: 'the contract library is great.',

  categories: [
    {
      hasHeader: true,
      name: 'basic',
      doc: 'the basic stuff',

      hasTypes: true,
      hasValues: true,

      types: [
        {
          name: 'contractObject',
          doc: 'contract are represented with object.',
          type: 'c.object',
        },
        {
          name: 'objectContractObject',
          doc: 'object contract have extra values.',
          type: 'c.object',
        },
      ],

      values: [
        { name: 'c.string', type: 'contractObject', doc: 'the string type' },
        { name: 'c.any', type: 'contractObject', doc: 'accepts any value' },
      ],
    },

    {
      hasHeader: true,
      name: 'wrappers',
      doc: 'the stuff that needs wrapping',

      hasTypes: false,
      hasValues: true,

      values: [
        { name: 'c.tuple', type: 'contractObject', doc: 'the string type' },
        { name: 'c.any', type: 'contractObject', doc: 'accepts any value' },
      ],
    },
  ],
}

function renderDoc(strings) {
  return marked(strings.join('\n'))
}

function renderValue(item, name) {
  return {
    name: item.name || name,
    type: item.toString(),
    doc: renderDoc(item.theDoc),
  }
}

function renderType(type, name) {
  const result = {
    name: type.contractName,
    doc: renderDoc(type.theDoc),
  }

  if (!type.fieldContracts) {
    result.type = type.toString()
  } else {
    result.isObject = true
    result.fields = __.map(type.fieldContracts, renderValue)
  }
  return result
}

function renderCategories(mod) {
  function filterForCat(list, cat) {
    const result = {}
    __.each(list, function (v, n) {
      if (v.category === cat) result[n] = v
    })
    return result
  }

  function addTypesValues(r, types, values) {
    r.types = __.map(types, renderType)
    r.values = __.map(values, renderValue)

    r.hasTypes = !__.isEmpty(r.types)
    r.hasValues = !__.isEmpty(r.values)
  }

  const result = __.map(mod.categories, function (cat) {
    const result = {
      hasHeader: true,
      name: c.name,
      doc: renderDoc(c.doc),
    }
    addTypesValues(
      result,
      filterForCat(mod.types, cat.name),
      filterForCat(mod.values, cat.name)
    )

    return result
  })

  const otherValues = filterForCat(mod.values, false)
  const otherTypes = filterForCat(mod.types, false)
  if (otherValues || otherTypes) {
    const other = { hasHeader: false }
    addTypesValues(other, otherTypes, otherValues)
    result.unshift(other)
  }

  return result
}

function renderModule(name) {
  const mod = c.documentationTable[name]

  return {
    name,
    doc: renderDoc(mod.doc),
    categories: renderCategories(mod),
  }
}

function generateHTML() {
  fs.readFile('resources/module.mustache', 'ascii', function (err, template) {
    if (err) {
      console.error('Could not open file: %s', err)
      process.exit(1)
    }
    console.log(renderModule('Contracts'))
    const html = m.to_html(
      template,
      // moduleTemplateData
      renderModule('Contracts')
    )
    console.log(html)
    fs.writeFileSync('output.html', html, 'ascii')
  })
}

generateHTML()

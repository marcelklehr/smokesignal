var net  = require('net')
  , Node = require('./lib/node')

/**
Creates a node and binds it to a server
*/
exports.createNode = function createNode(opts) {
  return new Node(opts)
}
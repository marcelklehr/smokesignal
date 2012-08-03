# The Protocol
```
package(type, id, content)
	type:
	 - connect
	 - ping
	 - pong
	 - broadcast

	id: fromIP-timestamp-hash(content)
	
	content: [see below]

```

## connect
A node may send a `connect` along with its own address and port to any other node:
```
content: { remoteAddress: '0.0.0.0'
         , remotePort: 0 }
```

The receiving node must forward it to its peers and/or respond itself with a `connect`...
```
content: { respondsTo: "<ID-of-the-above-package>" }
```
and they become peers. :)

## broadcast
A node may send `broadcast` packages along with any data to any (usually all) of its peers.
```
content: *
```
A node receiving a `broadcast` should forward it to all its peers.

## ping
A node may send a `ping` along with the ping target to any of its peers.
```
content: { targetIp: "0.0.0.0" 
         , origin: { remoteAddress: '0.0.0.0'
                   , remotePort: 0 } }
```
The receiving node must either...
 * respond with a `pong` (if it believes itself equal to the target; see below),
 * forward the package to one of its peers (if it believes that to be equal to the target), or
 * forward the package to all its peers

## pong
A node receiving a `ping` and believing itself to be equal to the ping target must send a `pong` directly to the node, the ping originated from.
```
content: { respondsTo: "<ID-of-the-above-package>" }
```

## handshake
A node may send a `handshake` along with the remoteAddress of the node the package is sent to:
```
{ type: "handshake"
, content: { remoteAddress: "0.0.0.0" }
}
```

This is, as you can see, no ordinary package, but should nonetheless result in a similar answer from the remote end on the same connection.

Sending handshakes allows you to determine your public facing IP address.
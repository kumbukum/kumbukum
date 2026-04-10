#!/bin/bash
# Wait for MongoDB to be ready
sleep 5

# Initiate replica set (single-node)
mongosh "mongodb://mongo:27017" --eval '
	rs.initiate({
		_id: "rs0",
		members: [{ _id: 0, host: "mongo:27017" }]
	});
'

echo "Replica set rs0 initiated."

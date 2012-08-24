## jschema

---
jschema is a JSON schema validation library, written to follow the JSON-schema draft 03 spec as found at http://tools.ietf.org/html/draft-zyp-json-schema-03

It is not yet a complete implementation, missing things from the draft are:

* item tuple schemas: the ability to define an array of schemas to match against an array
* additionalItems: since item tuples aren't supported, this isn't really possible yet
* default/title/description: while you can put these in your schema, they only serve as comments since the values are not used anywhere
* format: see section 5.23 of the draft, none of this is implemented
* extends: to maintain simplicity, extends is not implemented. it's easy enough to define your schema as smaller bits of json and reuse what you need to
* id
* $ref
* $schema
* Hyper Schema

Everything else stated in the spec is at least mostly functional. Note that, currently, there is no test suite. That's something I intend to fix ASAP.

Example usage:

    var jschema = require('jschema');
    var schema = {
        type: 'object',
        title: 'main',
        additionalProperties: {
            type: 'string'
        },
        patternProperties: {
            'h$': {
                type: 'number'
            }
        },
    };

    var test = jschema(schema);
    test.validate({ one: 'test', bath: 'cold', hearth: 'test', bacon: 'test' }, function (err) {
        if (err) {
            console.log(err); // properties 'bath' and 'hearth' will fail, as they match patternProperties and are not numbers
        } else {
            console.log('looks valid!');
        }
    });

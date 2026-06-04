This repo contains a data-driven homepage dashboard with a Node backend that can do healthchecks and provide stats for each service.
The front-end and back-end communicates using a DSL tentatively called CAMEL(Client-agnostic Arranged Metrics Enumeration Language).

CAMEL Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.org/camel.schema.json",
  "title": "CAMEL Metric Node",

  "$defs": {
    "metric": {
      "type": "object",
      "required": [
        "type",
        "label"
      ],
      "properties": {
        "type": {
          "const": "metric"
        },
        "label": {
          "type": "string"
        },
        "value": {}
      }
    },

    "threshold": {
      "type": "object",
      "required": [
        "label",
        "from",
        "to"
      ],
      "properties": {
        "label": {
          "type": "string"
        },
        "from": {
          "type": "number"
        },
        "to": {
          "type": "number"
        }
      }
    },

    "bar": {
      "type": "object",
      "required": [
        "type",
        "label",
        "percent"
      ],
      "properties": {
        "type": {
          "const": "bar"
        },
        "label": {
          "type": "string"
        },
        "value": {},
        "percent": {
          "type": "number",
          "minimum": 0,
          "maximum": 100
        },
        "thresholds": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/threshold"
          }
        }
      }
    },

    "compareBar": {
      "type": "object",
      "required": [
        "type",
        "label",
        "value",
        "total"
      ],
      "properties": {
        "type": {
          "const": "compareBar"
        },
        "label": {
          "type": "string"
        },
        "value": {
          "type": "number"
        },
        "total": {
          "type": "number",
          "exclusiveMinimum": 0
        }
      }
    },

    "group": {
      "type": "object",
      "required": [
        "type",
        "label",
        "children"
      ],
      "properties": {
        "type": {
          "const": "group"
        },
        "label": {
          "type": "string"
        },
        "children": {
          "type": "array",
          "items": {
            "$ref": "#"
          }
        }
      }
    }
  },
  "metric": {
    "type": "array",
    "items": {
      "oneOf": [
      {
        "$ref": "#/$defs/metric"
      },
      {
        "$ref": "#/$defs/bar"
      },
      {
        "$ref": "#/$defs/compareBar"
      },
      {
        "$ref": "#/$defs/group"
      }
    ]
    }
  }
}

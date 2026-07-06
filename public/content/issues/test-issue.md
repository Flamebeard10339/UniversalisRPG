## Target universe
base

## Notes
First test of github issue. This mod only changes the positions of existing locations.

## Validation
No validation issues.

## App version
0.1.0

## Changed JSON
```json
[
  {
    "path": "modules/local-contributions.json",
    "json": {
      "id": "local-contributions",
      "version": "1.0.0",
      "universe": "base",
      "author": "UniversalisRPG",
      "game_version": "1.0",
      "dependencies": [
        "+base-core"
      ],
      "data-updates": {
        "patches": [
          {
            "targetModId": "base-core",
            "objectType": "locations",
            "objectId": "emberwood",
            "ops": [
              {
                "op": "replace",
                "path": "/position/x",
                "value": 200
              },
              {
                "op": "replace",
                "path": "/position/y",
                "value": 80
              }
            ]
          },
          {
            "targetModId": "base-core",
            "objectType": "locations",
            "objectId": "old-quarry",
            "ops": [
              {
                "op": "replace",
                "path": "/position/x",
                "value": 200
              },
              {
                "op": "replace",
                "path": "/position/y",
                "value": 184
              }
            ]
          }
        ]
      }
    }
  }
]
```
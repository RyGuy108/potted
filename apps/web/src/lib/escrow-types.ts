/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/escrow.json`.
 */
export type Escrow = {
  "address": "Dzy1D6Hh883TobzpA6CgDhERD5zoCrmcjmjaUsfzrrGe",
  "metadata": {
    "name": "escrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Potted escrow: USDC pots that pay out or refund on a verified result"
  },
  "instructions": [
    {
      "name": "cancel",
      "discriminator": [
        232,
        219,
        223,
        41,
        219,
        236,
        220,
        190
      ],
      "accounts": [
        {
          "name": "streamer",
          "signer": true,
          "relations": [
            "challenge"
          ]
        },
        {
          "name": "challenge",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createChallenge",
      "docs": [
        "Opens a challenge and its vault. `condition_hash` commits to the",
        "exact condition text so it cannot be changed after fans pledge."
      ],
      "discriminator": [
        170,
        244,
        47,
        1,
        1,
        15,
        173,
        239
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Pays rent. Separate from the streamer so the app can sponsor fees."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "streamer",
          "signer": true
        },
        {
          "name": "verifier"
        },
        {
          "name": "mint"
        },
        {
          "name": "challenge",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  97,
                  108,
                  108,
                  101,
                  110,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "streamer"
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u64"
        },
        {
          "name": "verifierKind",
          "type": "u8"
        },
        {
          "name": "conditionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "settleBy",
          "type": "i64"
        },
        {
          "name": "pledgeCap",
          "type": "u64"
        },
        {
          "name": "upfrontPct",
          "type": "u8"
        }
      ]
    },
    {
      "name": "lock",
      "docs": [
        "Closes pledging when the attempt starts. The streamer or the",
        "verifier can call it."
      ],
      "discriminator": [
        21,
        19,
        208,
        43,
        237,
        62,
        255,
        87
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "challenge",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              }
            ]
          }
        },
        {
          "name": "streamerToken",
          "docs": [
            "The streamer's own token account; the up-front share can go nowhere else."
          ],
          "writable": true
        },
        {
          "name": "splits",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  108,
                  105,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "pledge",
      "docs": [
        "Moves `amount` from the fan into the vault. A fan can pledge more",
        "than once, up to the per-fan cap."
      ],
      "discriminator": [
        235,
        47,
        156,
        254,
        0,
        88,
        212,
        142
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Pays rent for the pledge record, so fans need no SOL."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "fan",
          "signer": true
        },
        {
          "name": "challenge",
          "writable": true
        },
        {
          "name": "pledge",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  101,
                  100,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "account",
                "path": "fan"
              }
            ]
          }
        },
        {
          "name": "fanToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "refund",
      "docs": [
        "Returns one fan's pledge. Anyone can call this once the challenge",
        "has failed, or once `settle_by` has passed with no result."
      ],
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
      ],
      "accounts": [
        {
          "name": "challenge",
          "writable": true,
          "relations": [
            "pledge"
          ]
        },
        {
          "name": "pledge",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  101,
                  100,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              },
              {
                "kind": "account",
                "path": "pledge.fan",
                "account": "pledge"
              }
            ]
          }
        },
        {
          "name": "fanToken",
          "docs": [
            "The fan's own token account; a refund can go nowhere else."
          ],
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "setSplits",
      "docs": [
        "Fixes who else is paid, and what whole percent each gets, before any",
        "fan pledges. Only the streamer can set them, and only once."
      ],
      "discriminator": [
        175,
        2,
        86,
        49,
        225,
        202,
        232,
        189
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "streamer",
          "signer": true,
          "relations": [
            "challenge"
          ]
        },
        {
          "name": "challenge"
        },
        {
          "name": "splits",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  108,
                  105,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": {
            "vec": {
              "defined": {
                "name": "share"
              }
            }
          }
        }
      ]
    },
    {
      "name": "settle",
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "verifier",
          "signer": true,
          "relations": [
            "challenge"
          ]
        },
        {
          "name": "challenge",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              }
            ]
          }
        },
        {
          "name": "streamerToken",
          "docs": [
            "The streamer's own token account; the host's part can go nowhere else."
          ],
          "writable": true
        },
        {
          "name": "splits",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  108,
                  105,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "challenge"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "success",
          "type": "bool"
        },
        {
          "name": "evidenceRef",
          "type": "string"
        },
        {
          "name": "evidenceHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "challenge",
      "discriminator": [
        119,
        250,
        161,
        121,
        119,
        81,
        22,
        208
      ]
    },
    {
      "name": "pledge",
      "discriminator": [
        161,
        197,
        121,
        46,
        99,
        75,
        169,
        131
      ]
    },
    {
      "name": "splits",
      "discriminator": [
        108,
        68,
        238,
        198,
        23,
        99,
        85,
        143
      ]
    }
  ],
  "events": [
    {
      "discriminator": [
        136,
        23,
        42,
        65,
        143,
        233,
        234,
        46
      ],
      "name": "cancelled"
    },
    {
      "discriminator": [
        166,
        178,
        174,
        178,
        11,
        172,
        98,
        243
      ],
      "name": "challengeCreated"
    },
    {
      "discriminator": [
        188,
        53,
        118,
        62,
        64,
        12,
        198,
        84
      ],
      "name": "locked"
    },
    {
      "discriminator": [
        98,
        154,
        68,
        227,
        24,
        48,
        26,
        16
      ],
      "name": "pledged"
    },
    {
      "discriminator": [
        35,
        103,
        149,
        246,
        196,
        123,
        221,
        99
      ],
      "name": "refunded"
    },
    {
      "discriminator": [
        232,
        210,
        40,
        17,
        142,
        124,
        145,
        238
      ],
      "name": "settled"
    },
    {
      "discriminator": [
        36,
        246,
        242,
        254,
        175,
        66,
        177,
        78
      ],
      "name": "sharePaid"
    },
    {
      "discriminator": [
        37,
        82,
        198,
        49,
        118,
        211,
        247,
        121
      ],
      "name": "splitsSet"
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "deadlineInPast",
      "msg": "The deadline must be in the future"
    },
    {
      "code": 6001,
      "name": "badSettleWindow",
      "msg": "settle_by must be at or after the deadline, within the allowed window"
    },
    {
      "code": 6002,
      "name": "zeroAmount",
      "msg": "Amount must be above zero"
    },
    {
      "code": 6003,
      "name": "notOpen",
      "msg": "This challenge is not taking pledges"
    },
    {
      "code": 6004,
      "name": "deadlinePassed",
      "msg": "The deadline has passed"
    },
    {
      "code": 6005,
      "name": "overPledgeCap",
      "msg": "That goes over the per-fan pledge cap"
    },
    {
      "code": 6006,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6007,
      "name": "unauthorized",
      "msg": "Only the verifier or streamer may do this"
    },
    {
      "code": 6008,
      "name": "alreadySettled",
      "msg": "This challenge was already settled"
    },
    {
      "code": 6009,
      "name": "settleWindowClosed",
      "msg": "The settlement window has closed; refunds are open"
    },
    {
      "code": 6010,
      "name": "evidenceTooLong",
      "msg": "Evidence reference is too long"
    },
    {
      "code": 6011,
      "name": "notRefundable",
      "msg": "This challenge is not refundable yet"
    },
    {
      "code": 6012,
      "name": "alreadyRefunded",
      "msg": "This pledge was already refunded"
    },
    {
      "code": 6013,
      "name": "upfrontTooHigh",
      "msg": "At most half the pot can be paid up front"
    },
    {
      "code": 6014,
      "name": "splitsAfterPledges",
      "msg": "Splits must be set before anyone pledges"
    },
    {
      "code": 6015,
      "name": "badSplits",
      "msg": "Up to 4 shares, each a whole percent from 1 to 99, adding up to 90% at most, none to the streamer"
    },
    {
      "code": 6016,
      "name": "missingShareAccount",
      "msg": "Pass a token account for every share"
    },
    {
      "code": 6017,
      "name": "wrongShareAccount",
      "msg": "A share's token account belongs to someone else or holds another token"
    }
  ],
  "types": [
    {
      "name": "cancelled",
      "type": {
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "totalPledged",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "challenge",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "streamer",
            "type": "pubkey"
          },
          {
            "name": "verifier",
            "docs": [
              "The only key allowed to settle."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "verifierKind",
            "docs": [
              "Which off-chain adapter decides this challenge (informational)."
            ],
            "type": "u8"
          },
          {
            "name": "conditionHash",
            "docs": [
              "SHA-256 of the canonical condition JSON."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "settleBy",
            "type": "i64"
          },
          {
            "name": "pledgeCap",
            "type": "u64"
          },
          {
            "name": "totalPledged",
            "type": "u64"
          },
          {
            "name": "totalRefunded",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "status"
              }
            }
          },
          {
            "name": "evidenceHash",
            "docs": [
              "SHA-256 of the full evidence record kept off-chain."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "evidenceRef",
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "upfrontPct",
            "docs": [
              "Share of the pot, 0 to MAX_UPFRONT_PCT, paid to the streamer at lock."
            ],
            "type": "u8"
          },
          {
            "name": "upfrontPaid",
            "docs": [
              "What lock actually paid out up front."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "challengeCreated",
      "type": {
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "streamer",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "settleBy",
            "type": "i64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "locked",
      "type": {
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "totalPledged",
            "type": "u64"
          },
          {
            "name": "upfrontPaid",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "pledge",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "fan",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "refunded",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pledged",
      "type": {
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "fan",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalPledged",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "refunded",
      "type": {
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "fan",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "settled",
      "type": {
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "success",
            "type": "bool"
          },
          {
            "name": "paidOut",
            "type": "u64"
          },
          {
            "name": "evidenceRef",
            "type": "string"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "share",
      "docs": [
        "One share of a successful pot, besides the host's."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "pct",
            "docs": [
              "Whole percent, 1 to 99."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "docs": [
        "A guest's or a cause's share, paid straight from the vault."
      ],
      "name": "sharePaid",
      "type": {
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "splits",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": {
              "vec": {
                "defined": {
                  "name": "share"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "splitsSet",
      "type": {
        "fields": [
          {
            "name": "challenge",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": {
              "vec": {
                "defined": {
                  "name": "share"
                }
              }
            }
          }
        ],
        "kind": "struct"
      }
    },
    {
      "name": "status",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "locked"
          },
          {
            "name": "paid"
          },
          {
            "name": "failed"
          }
        ]
      }
    }
  ]
};

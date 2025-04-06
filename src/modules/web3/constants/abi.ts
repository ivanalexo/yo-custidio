export const ballotAbi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        name: 'id',
        type: 'uint256',
      },
      {
        indexed: false,
        name: 'tableNumber',
        type: 'uint32',
      },
      {
        indexed: false,
        name: 'locationId',
        type: 'uint8',
      },
      {
        indexed: false,
        name: 'validVotes',
        type: 'uint32',
      },
      {
        indexed: false,
        name: 'nullVotes',
        type: 'uint32',
      },
      {
        indexed: false,
        name: 'blankVotes',
        type: 'uint32',
      },
      {
        indexed: false,
        name: 'partyNames',
        type: 'string[]',
      },
      {
        indexed: false,
        name: 'partyVotes',
        type: 'string[]',
      },
      {
        indexed: false,
        name: 'createdAt',
        type: 'uint256',
      },
    ],
    name: 'BallotCreated',
    type: 'event',
  },
  {
    inputs: [
      {
        name: '_tableNumber',
        type: 'uint32',
      },
      {
        name: '_locationId',
        type: 'uint8',
      },
      {
        name: '_validVotes',
        type: 'uint32',
      },
      {
        name: '_nullVotes',
        type: 'uint32',
      },
      {
        name: '_blankVotes',
        type: 'uint32',
      },
      {
        name: '_partyNames',
        type: 'string[]',
      },
      {
        name: '_partyVotes',
        type: 'string[]',
      },
    ],
    name: 'mint',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'arg0',
        type: 'uint256',
      },
    ],
    name: 'ballots',
    outputs: [
      {
        components: [
          {
            name: 'tableNumber',
            type: 'uint32',
          },
          {
            name: 'locationId',
            type: 'uint8',
          },
          {
            name: 'validVotes',
            type: 'uint32',
          },
          {
            name: 'nullVotes',
            type: 'uint32',
          },
          {
            name: 'blankVotes',
            type: 'uint32',
          },
          {
            name: 'partyNames',
            type: 'string[]',
          },
          {
            name: 'partyVotes',
            type: 'string[]',
          },
          {
            name: 'createdAt',
            type: 'uint256',
          },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    stateMutability: 'payable',
    type: 'constructor',
  },
] as const;

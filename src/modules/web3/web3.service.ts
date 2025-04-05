import { Injectable } from '@nestjs/common';
import { PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, webSocket } from 'viem';
import { sonic } from 'viem/chains';
import { ballotAddress } from './constants/addresses';
import { ballotAbi } from './constants/abi';

interface Ballot {
  tableNumber: number;
  locationId: number;
  validVotes: number;
  nullVotes: number;
  blankVotes: number;
  partyNames: readonly string[];
  partyVotes: readonly string[];
}

@Injectable()
export class Web3Service {
  constructor(
    private account: PrivateKeyAccount = privateKeyToAccount(
      process.env.PRIVATE_KEY as `0x${string}`,
    ),
    private publicClient = createPublicClient({
      chain: sonic,
      transport: webSocket('wss://sonic.drpc.org'),
    }),
    private walletClient = createWalletClient({
      chain: sonic,
      transport: webSocket('wss://sonic.drpc.org'),
      account: this.account,
    }),
  ) {}

  async name() {
    const data = await this.publicClient.readContract({
      address: ballotAddress,
      abi: ballotAbi,
      functionName: 'name',
    });
    return data;
  }

  async symbol() {
    const data = await this.publicClient.readContract({
      address: ballotAddress,
      abi: ballotAbi,
      functionName: 'name',
    });
    return data;
  }

  async ballots() {
    const totalSupply = await this.publicClient.readContract({
      address: ballotAddress,
      abi: ballotAbi,
      functionName: 'totalSupply',
    });

    const ballots: Ballot[] = [];
    for (let i = 0; i < Number(totalSupply); i++) {
      const data = await this.publicClient.readContract({
        address: ballotAddress,
        abi: ballotAbi,
        functionName: 'ballots',
        args: [BigInt(i)],
      });
      ballots.push(data);
    }
    await Promise.all(ballots);
    return ballots;
  }

  async ballot(id: bigint) {
    const data = await this.publicClient.readContract({
      address: ballotAddress,
      abi: ballotAbi,
      functionName: 'ballots',
      args: [id],
    });
    return data;
  }

  async mint(
    _tableNumber: number,
    _locationId: number,
    _validVotes: number,
    _nullVotes: number,
    _blankVotes: number,
    _partyNames: string[],
    _partyVotes: string[],
  ) {
    const { request } = await this.publicClient.simulateContract({
      address: ballotAddress,
      abi: ballotAbi,
      functionName: 'mint',
      args: [
        _tableNumber,
        _locationId,
        _validVotes,
        _nullVotes,
        _blankVotes,
        _partyNames,
        _partyVotes,
      ],
    });
    await this.walletClient.writeContract(request);
  }
}

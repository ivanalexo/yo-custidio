import { Test, TestingModule } from '@nestjs/testing';
import { Web3Controller } from './web3.controller';
import { Web3Service } from './web3.service';

describe('Web3Controller', () => {
  let controller: Web3Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [Web3Controller],
      providers: [Web3Service],
    }).compile();

    controller = module.get<Web3Controller>(Web3Controller);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

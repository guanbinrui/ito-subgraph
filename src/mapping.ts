import { Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import { fetchToken } from "./helpers";
import { CHAIN_ID, CONTRACT_ADDR, GENESIS_TIMESTAMP } from "./constants";
import {
  ClaimSuccess,
  FillSuccess,
  RefundSuccess,
  Test,
  Fill_poolCall,
} from "../generated/ITO/ITO";
import {
  PoolInfo,
  ExchangeInfo,
  Pool,
  Seller,
  Buyer,
  Token,
} from "../generated/schema";

export function handleFillPool(call: Fill_poolCall): void {
  let txHash = call.transaction.hash.toHexString();
  let record = PoolInfo.load(txHash);

  // the event handler will be called before call handler
  // if a map record cannot be found than we skip the call
  if (!record) return;

  // create seller
  let seller_addr = call.from.toHexString();
  let seller = Seller.load(seller_addr);
  if (seller == null) {
    seller = new Seller(seller_addr);
  }
  seller.address = call.from;
  seller.name = call.inputs.name;
  seller.message = call.inputs.message;
  seller.save();

  // create token
  let token = fetchToken(call.inputs._token_addr);
  token.save();

  // create exchange tokens
  let addrs = call.inputs._exchange_addrs as Array<Address>;
  let exchange_addrs = new Array<string>(addrs.length);
  let exchange_tokens = new Array<Token>(addrs.length);
  for (let i = 0; i < addrs.length; i += 1) {
    let token_addr_ = addrs[i] as Address;
    let token_ = fetchToken(token_addr_);
    token_.save();
    exchange_tokens[i] = token_;
    exchange_addrs[i] = token_addr_.toHexString();
  }

  // create pool
  let pool = new Pool(record.pid);
  pool.chain_id = CHAIN_ID;
  pool.contract_address = Bytes.fromHexString(CONTRACT_ADDR) as Address;
  pool.pid = record.pid;
  pool.password = "PASSWORD INVALID"; // a password was stored locally
  pool.hash = call.inputs._hash.toHexString();
  pool.limit = call.inputs._limit;
  pool.total = call.inputs._total_tokens;
  pool.total_remaining = call.inputs._total_tokens;
  pool.seller = seller.id;
  pool.start_time = call.inputs._start.plus(BigInt.fromI32(GENESIS_TIMESTAMP));
  pool.end_time = call.inputs._end.plus(BigInt.fromI32(GENESIS_TIMESTAMP));
  pool.creation_time = record.creation_time;
  pool.last_updated_time = record.creation_time;
  pool.token = token.id;
  pool.exchange_amounts = call.inputs._ratios;
  pool.exchange_tokens = exchange_addrs;
  pool.save();
}

export function handleClaimSuccess(event: ClaimSuccess): void {
  // create token
  let token = fetchToken(event.params.token_address);
  token.save();

  // create buyer
  let buyer_addr = event.params.claimer.toHexString();
  let buyer = Buyer.load(buyer_addr);
  if (buyer == null) {
    buyer = new Buyer(buyer_addr);
  }
  buyer.address = event.params.claimer;
  buyer.save();

  // update pool
  let pid = event.params.id.toHexString();
  let pool = Pool.load(pid);
  if (pool == null) {
    return;
  }
  pool.last_updated_time = event.block.timestamp;
  pool.total_remaining = pool.total_remaining.minus(event.params.claimed_value);
  pool.save();

  // create exchange info
  let exchangeInfo = new ExchangeInfo(event.transaction.hash.toHexString());
  exchangeInfo.pid = pid;
  exchangeInfo.buyer = buyer.id;
  exchangeInfo.buy_time = event.block.timestamp;
  exchangeInfo.buy_amount = event.params.claimed_value;
  exchangeInfo.buy_token = token.id;
  exchangeInfo.save();
}

export function handleFillSuccess(event: FillSuccess): void {
  let txHash = event.transaction.hash.toHexString();

  // the event handlers will be triggered before call handlers in the same transaction
  // this event handler only stores the necessary pool info into a map
  // the creation of the pool happens when the call handler was triggered
  let poolMap = new PoolInfo(txHash);
  poolMap.pid = event.params.id.toHexString();
  poolMap.creation_time = event.params.creation_time;
  poolMap.save();
}

export function handleRefundSuccess(event: RefundSuccess): void {}

export function handleTest(event: Test): void {}

import { readFileSync } from 'node:fs'
import type { PaymentInput } from './types'
import React from 'react'
import * as utils from '../shared/utils'
const { legacy } = require('./legacy')

// function fakeInComment() {}
/* class FakeClass {} */
const s = 'function alsoFake() {}'
const re = /function notreal\(/g

export async function processPayment(input: PaymentInput): Promise<PaymentResult> {
  const result = await chargeCard(input)
  if (!result.ok) {
    return recordFailure(input, result)
  }
  return result
}

export const validateInput = (x: PaymentInput) => x.amount > 0

export class PaymentService {
  async charge(amount: number) {
    return this.gateway.send(amount)
  }
  private log(msg: string) { console.log(msg) }
}

export interface PaymentResult { ok: boolean }
export type Status = 'pending' | 'done'

const handlers = {}
handlers[key]()

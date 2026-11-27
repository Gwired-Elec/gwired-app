import { describe, expect, it } from 'vitest'
import { formatGBP, parsePounds, percentOf, roundHalfUp, sum, toInputPounds } from './index'

describe('parsePounds', () => {
  it('reads common ways of typing money', () => {
    expect(parsePounds('1,234.56')).toBe(123456)
    expect(parsePounds('£1234')).toBe(123400)
    expect(parsePounds('12.5')).toBe(1250)
    expect(parsePounds('0.07')).toBe(7)
    expect(parsePounds('-45.10')).toBe(-4510)
  })
  it('rejects nonsense and more than 2 decimals', () => {
    expect(parsePounds('')).toBeNull()
    expect(parsePounds('abc')).toBeNull()
    expect(parsePounds('1.234')).toBeNull()
    expect(parsePounds('1.2.3')).toBeNull()
  })
  it('never goes through floating point', () => {
    expect(parsePounds('19.99')).toBe(1999)
    expect(parsePounds('1.15')).toBe(115)
  })
})

describe('formatting', () => {
  it('formats as GBP', () => {
    expect(formatGBP(123456)).toBe('£1,234.56')
    expect(formatGBP(5)).toBe('£0.05')
  })
  it('makes an editable amount', () => {
    expect(toInputPounds(123450)).toBe('1234.50')
    expect(toInputPounds(null)).toBe('')
  })
})

describe('rounding and percentages', () => {
  it('rounds halves up, away from zero', () => {
    expect(roundHalfUp(2.5)).toBe(3)
    expect(roundHalfUp(-2.5)).toBe(-3)
    expect(roundHalfUp(2.4)).toBe(2)
  })
  it('takes a percentage in whole pence', () => {
    expect(percentOf(10000, 20)).toBe(2000) // VAT on £100
    expect(percentOf(1999, 20)).toBe(400) // 399.8 -> 400
    expect(percentOf(1, 50)).toBe(1) // 0.5 -> 1
    expect(percentOf(12345, 5)).toBe(617) // 617.25 -> 617
  })
  it('adds up exactly', () => {
    expect(sum([10, 20, 30])).toBe(60)
    expect(sum([])).toBe(0)
  })
})

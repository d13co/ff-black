import { Contract } from '@algorandfoundation/algorand-typescript'

export class FfBlack extends Contract {
  public hello(name: string): string {
    return `Hello, ${name}`
  }
}

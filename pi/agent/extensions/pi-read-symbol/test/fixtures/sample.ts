export interface Shape {
  area(): number;
}

export class Square implements Shape {
  constructor(private side: number) {}

  area(): number {
    return this.side * this.side;
  }
}

export const double = (x: number): number => x * 2;

const LIMIT = 10;

export function total(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

declare function open(path: string): void;

export function read(path: string): string;
export function read(path: string, encoding: string): string;
export function read(path: string, encoding?: string): string {
  return path;
}

export abstract class Base {
  abstract run(): void;
}

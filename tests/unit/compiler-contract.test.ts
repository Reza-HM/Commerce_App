import 'reflect-metadata';
import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Injectable()
class Dependency {}

@Injectable()
class Consumer {
  constructor(readonly dependency: Dependency) {}
}

@Module({ providers: [Dependency, Consumer] })
class CompilerContractModule {}

test('the test compiler preserves Nest constructor injection metadata', async () => {
  const context = await NestFactory.createApplicationContext(CompilerContractModule, {
    logger: false,
  });
  try {
    expect(context.get(Consumer).dependency).toBe(context.get(Dependency));
  } finally {
    await context.close();
  }
});

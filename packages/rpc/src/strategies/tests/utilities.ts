import {v4 as uuid} from 'uuid';

import {MessageChannel} from '../../tests/utilities';
import {fromMessagePort} from '../../adaptors';
import {Retainer, FunctionStrategy, FunctionStrategyOptions} from '../../types';

(global as any).MessageChannel = MessageChannel;

type FunctionStrategyCreator<T> = (
  options: FunctionStrategyOptions,
) => FunctionStrategy<T>;

const FUNCTION = '_@f';

export function createFunctionStrategyPair<T>(
  createStrategy: FunctionStrategyCreator<T>,
) {
  const {port1, port2} = new MessageChannel();

  return [
    functionStrategyFromMessagePort(port1, createStrategy),
    functionStrategyFromMessagePort(port2, createStrategy),
  ];
}

function functionStrategyFromMessagePort<T>(
  port: MessagePort,
  createStrategy: FunctionStrategyCreator<T>,
) {
  const functions = createStrategy({
    uuid,
    toWire,
    fromWire,
    messenger: fromMessagePort(port),
  });

  return functions;

  function toWire(value: unknown): [any, Transferable[]?] {
    if (typeof value === 'object') {
      if (value == null) {
        return [value];
      }

      const transferables: Transferable[] = [];

      if (Array.isArray(value)) {
        const result = value.map((item) => {
          const [result, nestedTransferables = []] = toWire(item);
          transferables.push(...nestedTransferables);
          return result;
        });

        return [result, transferables];
      }

      const result = Object.keys(value).reduce((object, key) => {
        const [result, nestedTransferables = []] = toWire((value as any)[key]);
        transferables.push(...nestedTransferables);
        return {...object, [key]: result};
      }, {});

      return [result, transferables];
    }

    if (typeof value === 'function') {
      const [result, transferables] = functions.toWire(value);
      return [{[FUNCTION]: result}, transferables];
    }

    return [value];
  }

  function fromWire<Input = unknown, Output = unknown>(
    value: Input,
    retainedBy: Retainer[] = [],
  ): Output {
    if (typeof value === 'object') {
      if (value == null) {
        return value as any;
      }

      if (Array.isArray(value)) {
        return value.map((value) => fromWire(value, retainedBy)) as any;
      }

      if ((value as any)[FUNCTION]) {
        return functions.fromWire((value as any)[FUNCTION], retainedBy) as any;
      }

      return Object.keys(value).reduce(
        (object, key) => ({
          ...object,
          [key]: fromWire((value as any)[key], retainedBy),
        }),
        {},
      ) as any;
    }

    return value as any;
  }
}

export function createResolvablePromise<T>(value: T) {
  let promiseResolve!: (value: T) => void;
  let resolved = false;

  const promise = new Promise<T>((resolve) => {
    promiseResolve = resolve;
  });

  return {
    promise,
    resolve: () => {
      promiseResolve(value);
      resolved = true;
      return promise;
    },
    resolved: () => resolved,
  };
}

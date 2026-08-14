// @vitest-environment node
/**
 * Z7-R5.2 — executable production inventory for direct and transitive ledger consumers.
 * New roots, table touches, RPCs/views/functions, SQL aliases, or dependency edges must
 * be explicitly classified here before the suite returns green.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type UseClass = 'billable' | 'aggregate' | 'status-only' | 'write' | 'historical';

const ROOT = process.cwd();
const NON_PRODUCTION_ROOTS = new Set([
  '.git', '.next', '__mocks__', '__tests__', 'coverage', 'docs', 'node_modules',
  'playwright-report', 'public', 'scripts', 'styles', 'supabase', 'test-results', 'tests',
]);

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function productionSourceFiles(root = ROOT): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && !NON_PRODUCTION_ROOTS.has(entry.name)) {
      return filesBelow(join(root, entry.name));
    }
    return entry.isFile() ? [join(root, entry.name)] : [];
  }).filter((path) =>
    /\.[jt]sx?$/.test(path) &&
    !/(?:^|\/)(?:__tests__|tests)(?:\/|$)/.test(path) &&
    !/\.(?:test|spec)\.[^.]+$/.test(path)
  );
}

type MethodName = 'from' | 'rpc';
type SequenceMutationName =
  | 'push' | 'pop' | 'shift' | 'unshift' | 'splice'
  | 'reverse' | 'fill' | 'copyWithin' | 'sort';
type DiscoveredCall = {
  method: MethodName | 'unknown';
  target?: string;
  targets?: string[];
  unsupported?: 'dynamic callable name' | 'dynamic target';
  expression?: string;
  dynamicKind?: 'callable' | 'target';
  dynamicValues?: string[];
  position?: number;
};

interface AbstractPropertyDescriptor {
  kind: 'data' | 'accessor';
  value?: AbstractValue;
  get?: AbstractValue;
  set?: AbstractValue;
  writable: boolean;
  enumerable: boolean;
  configurable: boolean;
}

type CompletionKind = 'normal' | 'throw' | 'return' | 'break' | 'continue';
interface Completion {
  kind: CompletionKind;
  value?: AbstractValue;
  label?: string;
}

interface AbstractValue {
  strings: Set<string>;
  numbers: Set<number>;
  methods: Set<MethodName>;
  properties: Map<string, AbstractValue>;
  descriptors: Map<string, AbstractPropertyDescriptor>;
  prototype?: AbstractValue;
  exactShape: boolean;
  elements?: AbstractValue;
  tupleElements?: AbstractValue[];
  external: boolean;
  callableCandidate: boolean;
  functions: Set<ts.FunctionLikeDeclaration>;
  boundArguments?: AbstractValue[];
  boundReceiver?: AbstractValue;
  adapter?: 'call' | 'apply' | 'bind' | 'reflectApply';
  adapterCallable?: AbstractValue;
  adapterConflict: boolean;
  receiverProvenance?: 'database' | 'non-database' | 'ambiguous';
  sequenceBuilder?: 'constructor' | 'of' | 'from' | 'concat';
  sequenceBuilderConflict: boolean;
  sequenceSource?: AbstractValue;
  sequenceMutation?: SequenceMutationName;
  sequenceMutationConflict: boolean;
  sequenceMutationTarget?: AbstractValue;
  sequenceAliases?: Set<AbstractValue>;
  primitives: Set<'null' | 'undefined' | 'true' | 'false'>;
  integrity?: 'extensible' | 'nonextensible' | 'sealed' | 'frozen';
  alwaysThrows: boolean;
}

function valueOf(partial: Partial<AbstractValue> = {}): AbstractValue {
  return {
    strings: partial.strings ?? new Set(),
    numbers: partial.numbers ?? new Set(),
    methods: partial.methods ?? new Set(),
    properties: partial.properties ?? new Map(),
    descriptors: partial.descriptors ?? new Map(),
    prototype: partial.prototype,
    exactShape: partial.exactShape ?? false,
    elements: partial.elements,
    tupleElements: partial.tupleElements,
    external: partial.external ?? false,
    callableCandidate: partial.callableCandidate ?? false,
    functions: partial.functions ?? new Set(),
    boundArguments: partial.boundArguments,
    boundReceiver: partial.boundReceiver,
    adapter: partial.adapter,
    adapterCallable: partial.adapterCallable,
    adapterConflict: partial.adapterConflict ?? false,
    receiverProvenance: partial.receiverProvenance,
    sequenceBuilder: partial.sequenceBuilder,
    sequenceBuilderConflict: partial.sequenceBuilderConflict ?? false,
    sequenceSource: partial.sequenceSource,
    sequenceMutation: partial.sequenceMutation,
    sequenceMutationConflict: partial.sequenceMutationConflict ?? false,
    sequenceMutationTarget: partial.sequenceMutationTarget,
    sequenceAliases: partial.sequenceAliases,
    primitives: partial.primitives ?? new Set(),
    integrity: partial.integrity,
    alwaysThrows: partial.alwaysThrows ?? false,
  };
}

const NODE_BUILTIN_MODULES = new Set(builtinModules.flatMap((name) => [
  name,
  name.startsWith('node:') ? name : `node:${name}`,
]));

function importProvenance(moduleName: string): NonNullable<AbstractValue['receiverProvenance']> {
  if (NODE_BUILTIN_MODULES.has(moduleName)) return 'non-database';
  if (/(?:^|[/@_-])supabase(?:[/@_.-]|$)/i.test(moduleName)) return 'database';
  return 'ambiguous';
}

function unionValues(...values: AbstractValue[]): AbstractValue {
  const memo = new WeakMap<AbstractValue, WeakMap<AbstractValue, AbstractValue>>();

  function pair(left: AbstractValue, right: AbstractValue): AbstractValue {
    if (left === right) return left;
    const prior = memo.get(left)?.get(right);
    if (prior) return prior;

    const result = valueOf();
    const rightMemo = memo.get(left) ?? new WeakMap<AbstractValue, AbstractValue>();
    rightMemo.set(right, result);
    memo.set(left, rightMemo);
    const leftMemo = memo.get(right) ?? new WeakMap<AbstractValue, AbstractValue>();
    leftMemo.set(left, result);
    memo.set(right, leftMemo);

    left.strings.forEach((entry) => result.strings.add(entry));
    right.strings.forEach((entry) => result.strings.add(entry));
    left.numbers.forEach((entry) => result.numbers.add(entry));
    right.numbers.forEach((entry) => result.numbers.add(entry));
    left.methods.forEach((entry) => result.methods.add(entry));
    right.methods.forEach((entry) => result.methods.add(entry));
    left.functions.forEach((entry) => result.functions.add(entry));
    right.functions.forEach((entry) => result.functions.add(entry));
    left.primitives.forEach((entry) => result.primitives.add(entry));
    right.primitives.forEach((entry) => result.primitives.add(entry));
    result.external = left.external || right.external;
    result.callableCandidate = left.callableCandidate || right.callableCandidate;
    result.receiverProvenance = left.receiverProvenance === right.receiverProvenance
      ? left.receiverProvenance
      : left.receiverProvenance && right.receiverProvenance
        ? 'ambiguous'
        : left.receiverProvenance ?? right.receiverProvenance;
    result.integrity = left.integrity === right.integrity
      ? left.integrity : left.integrity && right.integrity ? undefined : left.integrity ?? right.integrity;
    result.alwaysThrows = left.alwaysThrows && right.alwaysThrows;

    const propertyNames = new Set([...left.properties.keys(), ...right.properties.keys()]);
    for (const name of propertyNames) {
      const leftProperty = left.properties.get(name);
      const rightProperty = right.properties.get(name);
      result.properties.set(name, leftProperty && rightProperty
        ? pair(leftProperty, rightProperty)
        : leftProperty ?? rightProperty!);
    }
    const descriptorNames = new Set([...left.descriptors.keys(), ...right.descriptors.keys()]);
    for (const name of descriptorNames) {
      const leftDescriptor = left.descriptors.get(name);
      const rightDescriptor = right.descriptors.get(name);
      if (!leftDescriptor || !rightDescriptor || leftDescriptor.kind !== rightDescriptor.kind) {
        result.descriptors.set(name, leftDescriptor ?? rightDescriptor!);
        continue;
      }
      result.descriptors.set(name, leftDescriptor.kind === 'data' ? {
        kind: 'data',
        value: leftDescriptor.value && rightDescriptor.value
          ? pair(leftDescriptor.value, rightDescriptor.value)
          : leftDescriptor.value ?? rightDescriptor.value,
        writable: leftDescriptor.writable || rightDescriptor.writable,
        enumerable: leftDescriptor.enumerable || rightDescriptor.enumerable,
        configurable: leftDescriptor.configurable || rightDescriptor.configurable,
      } : {
        kind: 'accessor',
        get: leftDescriptor.get && rightDescriptor.get
          ? pair(leftDescriptor.get, rightDescriptor.get)
          : leftDescriptor.get ?? rightDescriptor.get,
        set: leftDescriptor.set && rightDescriptor.set
          ? pair(leftDescriptor.set, rightDescriptor.set)
          : leftDescriptor.set ?? rightDescriptor.set,
        writable: false,
        enumerable: leftDescriptor.enumerable || rightDescriptor.enumerable,
        configurable: leftDescriptor.configurable || rightDescriptor.configurable,
      });
    }
    result.prototype = left.prototype && right.prototype
      ? pair(left.prototype, right.prototype) : left.prototype ?? right.prototype;
    result.exactShape = left.exactShape && right.exactShape;
    result.elements = left.elements && right.elements
      ? pair(left.elements, right.elements)
      : left.elements ?? right.elements;
    const tupleLength = Math.max(left.tupleElements?.length ?? 0, right.tupleElements?.length ?? 0);
    if (tupleLength > 0) {
      result.tupleElements = Array.from({ length: tupleLength }, (_, index) => {
        const leftElement = left.tupleElements?.[index];
        const rightElement = right.tupleElements?.[index];
        return leftElement && rightElement
          ? pair(leftElement, rightElement)
          : leftElement ?? rightElement!;
      });
      const aliases = new Set<AbstractValue>();
      const addAliases = (value: AbstractValue): void => {
        if (value.sequenceAliases) value.sequenceAliases.forEach((alias) => aliases.add(alias));
        else if (value.tupleElements) aliases.add(value);
      };
      addAliases(left);
      addAliases(right);
      if (aliases.size > 1) result.sequenceAliases = aliases;
    }

    const boundLength = Math.max(left.boundArguments?.length ?? 0, right.boundArguments?.length ?? 0);
    if (boundLength > 0) {
      result.boundArguments = Array.from({ length: boundLength }, (_, index) => {
        const leftArgument = left.boundArguments?.[index];
        const rightArgument = right.boundArguments?.[index];
        return leftArgument && rightArgument
          ? pair(leftArgument, rightArgument)
          : leftArgument ?? rightArgument!;
      });
    }
    result.boundReceiver = left.boundReceiver && right.boundReceiver
      ? pair(left.boundReceiver, right.boundReceiver)
      : left.boundReceiver ?? right.boundReceiver;

    result.adapterConflict = left.adapterConflict || right.adapterConflict ||
      Boolean(left.adapter && right.adapter && left.adapter !== right.adapter);
    if (result.adapterConflict) {
      result.external = true;
      result.callableCandidate = true;
    } else {
      result.adapter = left.adapter ?? right.adapter;
      result.adapterCallable = left.adapterCallable && right.adapterCallable
        ? pair(left.adapterCallable, right.adapterCallable)
        : left.adapterCallable ?? right.adapterCallable;
    }
    result.sequenceBuilderConflict = left.sequenceBuilderConflict || right.sequenceBuilderConflict ||
      Boolean(left.sequenceBuilder && right.sequenceBuilder &&
        left.sequenceBuilder !== right.sequenceBuilder);
    if (result.sequenceBuilderConflict) {
      result.external = true;
      result.callableCandidate = true;
    } else {
      result.sequenceBuilder = left.sequenceBuilder ?? right.sequenceBuilder;
      result.sequenceSource = left.sequenceSource && right.sequenceSource
        ? pair(left.sequenceSource, right.sequenceSource)
        : left.sequenceSource ?? right.sequenceSource;
    }
    result.sequenceMutationConflict = left.sequenceMutationConflict ||
      right.sequenceMutationConflict || Boolean(left.sequenceMutation && right.sequenceMutation &&
        left.sequenceMutation !== right.sequenceMutation);
    if (result.sequenceMutationConflict) {
      result.external = true;
      result.callableCandidate = true;
    } else {
      result.sequenceMutation = left.sequenceMutation ?? right.sequenceMutation;
      result.sequenceMutationTarget = left.sequenceMutationTarget && right.sequenceMutationTarget
        ? pair(left.sequenceMutationTarget, right.sequenceMutationTarget)
        : left.sequenceMutationTarget ?? right.sequenceMutationTarget;
    }
    return result;
  }

  if (values.length === 0) return valueOf();
  return values.slice(1).reduce((result, value) => pair(result, value), values[0]);
}

function readPropertyName(node: ts.PropertyName | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function discoverSupabaseCalls(source: string, file = 'probe.ts'): DiscoveredCall[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX
      : file.endsWith('.js') ? ts.ScriptKind.JS
        : file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const scopes: Array<Map<string, AbstractValue>> = [new Map()];
  let weakHeapUpdateDepth = 0;
  const calls: DiscoveredCall[] = [];
  const activeFunctions = new Set<ts.FunctionLikeDeclaration>();
  const functionInputs = new Map<ts.FunctionLikeDeclaration, AbstractValue[]>();
  const functionOutputs = new Map<ts.FunctionLikeDeclaration, AbstractValue>();
  const functionClosures = new Map<ts.FunctionLikeDeclaration, Map<string, AbstractValue>>();
  const functionStack: ts.FunctionLikeDeclaration[] = [];
  const receiverStack: AbstractValue[] = [];
  const topLevelExpressionResults = new WeakMap<ts.CallExpression, AbstractValue>();
  type ReceiverProvenance = NonNullable<AbstractValue['receiverProvenance']>;
  const moduleExportCache = new Map<string, Map<string, ReceiverProvenance>>();
  const activeModuleExports = new Set<string>();
  const hasUseStrict = (statements: ts.NodeArray<ts.Statement> | undefined): boolean =>
    Boolean(statements?.some((statement) => ts.isExpressionStatement(statement) &&
      ts.isStringLiteralLike(statement.expression) && statement.expression.text === 'use strict'));
  const sourceStrict = ts.isExternalModule(sf) || hasUseStrict(sf.statements);
  const strictMode = (): boolean => sourceStrict || functionStack.some((target) =>
    Boolean(target.body && ts.isBlock(target.body) && hasUseStrict(target.body.statements)));

  function binding(name: string): AbstractValue | undefined {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const found = scopes[index].get(name);
      if (found) return found;
    }
    return undefined;
  }

  function unwrap(node: ts.Expression): ts.Expression {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
      return unwrap(node.expression);
    }
    return node;
  }

  function functionValue(target: ts.FunctionLikeDeclaration): AbstractValue {
    return valueOf({ functions: new Set([target]), callableCandidate: true });
  }

  function setDataDescriptor(
    object: AbstractValue,
    name: string,
    value: AbstractValue,
    attributes = { writable: true, enumerable: true, configurable: true }
  ): void {
    object.descriptors.set(name, { kind: 'data', value, ...attributes });
    object.properties.set(name, value);
  }

  function setAccessorDescriptor(
    object: AbstractValue,
    name: string,
    get: AbstractValue | undefined,
    set: AbstractValue | undefined,
    attributes = { enumerable: true, configurable: true }
  ): void {
    object.descriptors.set(name, {
      kind: 'accessor', get, set, writable: false, ...attributes,
    });
    object.properties.delete(name);
  }

  function ownDescriptor(
    object: AbstractValue,
    name: string
  ): AbstractPropertyDescriptor | undefined {
    const descriptor = object.descriptors.get(name);
    if (descriptor) return descriptor;
    const legacy = object.properties.get(name);
    if (!legacy) return undefined;
    const synthesized: AbstractPropertyDescriptor = {
      kind: 'data', value: legacy, writable: true, enumerable: true, configurable: true,
    };
    object.descriptors.set(name, synthesized);
    return synthesized;
  }

  function inheritedDescriptor(
    object: AbstractValue,
    name: string,
    seen = new Set<AbstractValue>()
  ): { owner: AbstractValue; descriptor: AbstractPropertyDescriptor } | undefined {
    if (seen.has(object)) return undefined;
    seen.add(object);
    const descriptor = ownDescriptor(object, name);
    if (descriptor) return { owner: object, descriptor };
    return object.prototype ? inheritedDescriptor(object.prototype, name, seen) : undefined;
  }

  function readAbstractProperty(
    object: AbstractValue,
    name: string,
    receiver = object
  ): AbstractValue | undefined {
    const found = inheritedDescriptor(object, name);
    if (!found) return undefined;
    if (found.descriptor.kind === 'data') return found.descriptor.value ?? valueOf();
    if (!found.descriptor.get) return valueOf({ primitives: new Set(['undefined']) });
    const outputs = [...found.descriptor.get.functions]
      .map((getter) => invokeFunction(getter, [], receiver));
    return outputs.length > 0
      ? unionValues(...outputs)
      : found.descriptor.get.external
        ? valueOf({ external: true, callableCandidate: true })
        : valueOf({ primitives: new Set(['undefined']) });
  }

  function reflectValue(): AbstractValue {
    return valueOf({ properties: new Map([
      ['apply', valueOf({ adapter: 'reflectApply', callableCandidate: true })],
    ]), exactShape: true });
  }

  function functionConstructorValue(): AbstractValue {
    return valueOf({ properties: new Map([
      ['prototype', valueOf({ properties: new Map([
        ['call', valueOf({ adapter: 'call', callableCandidate: true })],
        ['apply', valueOf({ adapter: 'apply', callableCandidate: true })],
        ['bind', valueOf({ adapter: 'bind', callableCandidate: true })],
      ]) })],
    ]), exactShape: true });
  }

  function coherentSequence(
    tupleElements: AbstractValue[],
    external = false,
    extraElements?: AbstractValue
  ): AbstractValue {
    const properties = new Map<string, AbstractValue>();
    tupleElements.forEach((entry, index) => properties.set(String(index), entry));
    properties.set('length', valueOf({ numbers: new Set([tupleElements.length]) }));
    const candidates = [...tupleElements, ...(extraElements ? [extraElements] : [])];
    const sequence = valueOf({
      properties,
      tupleElements,
      elements: candidates.length > 0 ? unionValues(...candidates) : extraElements,
      external,
      callableCandidate: external && candidates.some((entry) => isDatabaseCallable(entry)),
      exactShape: !external,
    });
    tupleElements.forEach((entry, index) => setDataDescriptor(sequence, String(index), entry));
    setDataDescriptor(sequence, 'length', properties.get('length')!, {
      writable: true, enumerable: false, configurable: false,
    });
    return sequence;
  }

  function arrayConstructorValue(): AbstractValue {
    const prototype = valueOf({ properties: new Map(
      (['push', 'pop', 'shift', 'unshift', 'splice', 'reverse', 'fill',
        'copyWithin', 'sort'] as SequenceMutationName[]).map((method) => [
        method,
        valueOf({ sequenceMutation: method, callableCandidate: true }),
      ])
    ), exactShape: true });
    return valueOf({
      sequenceBuilder: 'constructor',
      callableCandidate: true,
      receiverProvenance: 'non-database',
      properties: new Map([
        ['of', valueOf({ sequenceBuilder: 'of', callableCandidate: true })],
        ['from', valueOf({ sequenceBuilder: 'from', callableCandidate: true })],
        ['prototype', prototype],
      ]),
      exactShape: true,
    });
  }

  function classValue(node: ts.ClassLikeDeclaration): AbstractValue {
    const properties = new Map<string, AbstractValue>();
    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const name = readPropertyName(member.name);
      if (name) properties.set(name, functionValue(member));
    }
    return valueOf({ properties, exactShape: true });
  }

  function mergeProvenance(
    left: ReceiverProvenance | undefined,
    right: ReceiverProvenance
  ): ReceiverProvenance {
    return !left || left === right ? right : 'ambiguous';
  }

  function resolveModulePath(moduleName: string, importerPath: string): string | undefined {
    if (!moduleName.startsWith('.')) return undefined;
    const base = join(dirname(importerPath), moduleName);
    const candidates = /\.(?:[cm]?[jt]sx?)$/.test(base)
      ? [base]
      : [
          `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mts`,
          `${base}.mjs`, `${base}.cts`, `${base}.cjs`, join(base, 'index.ts'),
          join(base, 'index.tsx'), join(base, 'index.js'), join(base, 'index.jsx'),
          join(base, 'index.mjs'), join(base, 'index.cjs'),
        ];
    return candidates.find((candidate) => existsSync(candidate));
  }

  function moduleExports(moduleName: string, importerPath: string): Map<string, ReceiverProvenance> {
    const direct = importProvenance(moduleName);
    const targetPath = resolveModulePath(moduleName, importerPath);
    if (!targetPath) return new Map([['*', direct], ['default', direct]]);
    const cached = moduleExportCache.get(targetPath);
    if (cached) return cached;
    if (activeModuleExports.has(targetPath)) {
      return new Map([['*', 'ambiguous'], ['#cycle', 'ambiguous']]);
    }
    activeModuleExports.add(targetPath);

    let exports = new Map<string, ReceiverProvenance>();
    let bareExports = exports;
    const locals = new Map<string, ReceiverProvenance>();
    const localObjects = new Map<string, Map<string, ReceiverProvenance>>();
    const objectChildren = new Map<
      Map<string, ReceiverProvenance>, Map<string, Map<string, ReceiverProvenance>>
    >();
    const objectPrototypes = new Map<
      Map<string, ReceiverProvenance>, Map<string, ReceiverProvenance>
    >();
    type ModuleDescriptor = {
      kind: 'data' | 'accessor';
      value?: ReceiverProvenance;
      valueMembers?: Map<string, ReceiverProvenance>;
      get?: ReceiverProvenance;
      getThisProperty?: string;
      set?: ReceiverProvenance;
      writable: boolean;
      enumerable: boolean;
      configurable: boolean;
    };
    const objectDescriptors = new Map<
      Map<string, ReceiverProvenance>, Map<string, ModuleDescriptor>
    >();
    const localStrings = new Map<string, string>();
    let sawCommonJsExport = false;
    const target = ts.createSourceFile(targetPath, readFileSync(targetPath, 'utf8'),
      ts.ScriptTarget.Latest, true,
      /x$/.test(targetPath) ? ts.ScriptKind.TSX
        : /\.[cm]?js$/.test(targetPath) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    const throwingFunctions = new Set<string>();
    const functionDeclarations = target.statements.filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && Boolean(statement.name)
    );
    let discoveredThrowingFunction = true;
    while (discoveredThrowingFunction) {
      discoveredThrowingFunction = false;
      for (const declaration of functionDeclarations) {
        if (!declaration.name || throwingFunctions.has(declaration.name.text) || !declaration.body) {
          continue;
        }
        let abrupt = false;
        const inspect = (node: ts.Node): void => {
          if (abrupt || (node !== declaration && ts.isFunctionLike(node))) return;
          if (ts.isThrowStatement(node) ||
              (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
               throwingFunctions.has(node.expression.text))) {
            abrupt = true;
            return;
          }
          ts.forEachChild(node, inspect);
        };
        inspect(declaration.body);
        if (abrupt) {
          throwingFunctions.add(declaration.name.text);
          discoveredThrowingFunction = true;
        }
      }
    }
    const statementAbrupt = (statement: ts.Statement): boolean => {
      if (ts.isThrowStatement(statement)) return true;
      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) return false;
      let abrupt = false;
      const inspect = (node: ts.Node): void => {
        if (abrupt || (node !== statement && ts.isFunctionLike(node))) return;
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
            throwingFunctions.has(node.expression.text)) {
          abrupt = true;
          return;
        }
        ts.forEachChild(node, inspect);
      };
      inspect(statement);
      return abrupt;
    };
    const directThrowIndex = target.statements.findIndex(statementAbrupt);
    const moduleThrows = directThrowIndex >= 0;
    const evaluationStatements = moduleThrows
      ? target.statements.slice(0, directThrowIndex) : target.statements;

    const setExport = (name: string, provenance: ReceiverProvenance): void => {
      exports.set(name, mergeProvenance(exports.get(name), provenance));
    };
    const moduleBinding = (
      source: string,
      imported: string
    ): ReceiverProvenance => {
      const graph = moduleExports(source, targetPath);
      return graph.get(imported) ??
        (resolveModulePath(source, targetPath) ? 'ambiguous' : graph.get('*') ?? importProvenance(source));
    };
    const graphAggregate = (
      graph: Map<string, ReceiverProvenance>
    ): ReceiverProvenance => [...flattenMembers(graph).entries()]
      .filter(([name]) => name !== '*')
      .reduce<ReceiverProvenance | undefined>(
        (result, [, provenance]) => mergeProvenance(result, provenance), undefined
      ) ?? graph.get('*') ?? 'non-database';
    const staticName = (
      name: ts.PropertyName | ts.Expression,
      computed = false
    ): string | undefined => {
      if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
        return ts.isIdentifier(name) && computed
          ? localStrings.get(name.text) : name.text;
      }
      if (ts.isComputedPropertyName(name)) return staticName(name.expression, true);
      return undefined;
    };
    const childMembers = (
      object: Map<string, ReceiverProvenance>,
      name: string,
      seen = new Set<Map<string, ReceiverProvenance>>()
    ): Map<string, ReceiverProvenance> | undefined => {
      if (seen.has(object)) return undefined;
      seen.add(object);
      const descriptor = objectDescriptors.get(object)?.get(name);
      if (descriptor?.kind === 'data' && descriptor.valueMembers) {
        return descriptor.valueMembers;
      }
      if (descriptor?.kind === 'accessor' && descriptor.getThisProperty) {
        return childMembers(object, descriptor.getThisProperty, new Set());
      }
      return objectChildren.get(object)?.get(name) ??
        (objectPrototypes.get(object)
          ? childMembers(objectPrototypes.get(object)!, name, seen) : undefined);
    };
    const memberProvenance = (
      object: Map<string, ReceiverProvenance>,
      name: string,
      seen = new Set<Map<string, ReceiverProvenance>>()
    ): ReceiverProvenance | undefined => {
      if (seen.has(object)) return undefined;
      seen.add(object);
      const descriptor = objectDescriptors.get(object)?.get(name);
      if (descriptor?.kind === 'data') return descriptor.value;
      if (descriptor?.kind === 'accessor') {
        if (descriptor.getThisProperty) {
          return memberProvenance(object, descriptor.getThisProperty, new Set());
        }
        return descriptor.get;
      }
      if (object.has(name)) return object.get(name);
      const prototype = objectPrototypes.get(object);
      return prototype ? memberProvenance(prototype, name, seen) : undefined;
    };
    const visibleMemberNames = (
      object: Map<string, ReceiverProvenance>,
      seen = new Set<Map<string, ReceiverProvenance>>()
    ): Set<string> => {
      if (seen.has(object)) return new Set();
      seen.add(object);
      const names = new Set([...object.keys(), ...(objectChildren.get(object)?.keys() ?? [])]);
      const prototype = objectPrototypes.get(object);
      if (prototype) visibleMemberNames(prototype, seen).forEach((name) => names.add(name));
      return names;
    };
    const ownModuleDescriptor = (
      object: Map<string, ReceiverProvenance>,
      name: string
    ): ModuleDescriptor | undefined => {
      const descriptor = objectDescriptors.get(object)?.get(name);
      if (descriptor) return descriptor;
      const value = object.get(name);
      if (!value) return undefined;
      const synthesized: ModuleDescriptor = {
        kind: 'data', value, valueMembers: objectChildren.get(object)?.get(name),
        writable: true, enumerable: true, configurable: true,
      };
      const descriptors = objectDescriptors.get(object) ?? new Map<string, ModuleDescriptor>();
      objectDescriptors.set(object, descriptors);
      descriptors.set(name, synthesized);
      return synthesized;
    };
    const inheritedModuleDescriptor = (
      object: Map<string, ReceiverProvenance>,
      name: string,
      seen = new Set<Map<string, ReceiverProvenance>>()
    ): ModuleDescriptor | undefined => {
      if (seen.has(object)) return undefined;
      seen.add(object);
      return ownModuleDescriptor(object, name) ?? (objectPrototypes.get(object)
        ? inheritedModuleDescriptor(objectPrototypes.get(object)!, name, seen) : undefined);
    };
    const setModuleData = (
      object: Map<string, ReceiverProvenance>,
      name: string,
      value: ReceiverProvenance,
      valueMembers?: Map<string, ReceiverProvenance>,
      attributes = { writable: true, enumerable: true, configurable: true }
    ): void => {
      object.set(name, value);
      const descriptors = objectDescriptors.get(object) ?? new Map<string, ModuleDescriptor>();
      objectDescriptors.set(object, descriptors);
      descriptors.set(name, { kind: 'data', value, valueMembers, ...attributes });
      if (valueMembers) {
        const children = objectChildren.get(object) ?? new Map();
        objectChildren.set(object, children);
        children.set(name, valueMembers);
      } else objectChildren.get(object)?.delete(name);
    };
    const moduleWrite = (
      object: Map<string, ReceiverProvenance>,
      name: string,
      value: ReceiverProvenance,
      valueMembers?: Map<string, ReceiverProvenance>
    ): boolean => {
      const descriptor = inheritedModuleDescriptor(object, name);
      if (descriptor?.kind === 'accessor') return Boolean(descriptor.set);
      if (descriptor?.kind === 'data' && !descriptor.writable) return false;
      setModuleData(object, name, value, valueMembers);
      return true;
    };
    function flattenMembers(
      object: Map<string, ReceiverProvenance>,
      prefix = '',
      output = new Map<string, ReceiverProvenance>(),
      active = new Set<Map<string, ReceiverProvenance>>()
    ): Map<string, ReceiverProvenance> {
      if (active.has(object)) {
        if (prefix) output.set(prefix, mergeProvenance(output.get(prefix), 'ambiguous'));
        return output;
      }
      active.add(object);
      const names = visibleMemberNames(object);
      for (const name of names) {
        if (name === '*') {
          output.set(prefix ? `${prefix}.*` : '*', object.get(name) ?? 'ambiguous');
          continue;
        }
        const qualified = prefix ? `${prefix}.${name}` : name;
        const provenance = memberProvenance(object, name);
        if (provenance) output.set(qualified, provenance);
        const child = childMembers(object, name);
        if (child) flattenMembers(child, qualified, output, new Set(active));
      }
      active.delete(object);
      return output;
    }
    const membersFromGraph = (
      graph: Map<string, ReceiverProvenance>
    ): Map<string, ReceiverProvenance> => {
      const root = new Map<string, ReceiverProvenance>();
      for (const [path, provenance] of graph) {
        if (path === '*') {
          root.set('*', provenance);
          continue;
        }
        const parts = path.split('.');
        let current = root;
        parts.forEach((part, index) => {
          if (index === parts.length - 1) current.set(part, provenance);
          else {
            const children = objectChildren.get(current) ?? new Map();
            objectChildren.set(current, children);
            const child = children.get(part) ?? new Map<string, ReceiverProvenance>();
            children.set(part, child);
            current.set(part, current.get(part) ?? 'non-database');
            current = child;
          }
        });
      }
      return root;
    };
    function expressionMembers(
      expression: ts.Expression | undefined,
      seen = new Set<ts.Node>()
    ): Map<string, ReceiverProvenance> | undefined {
      if (!expression || seen.has(expression)) return undefined;
      seen.add(expression);
      const current = ts.isParenthesizedExpression(expression) ? expression.expression : expression;
      if (ts.isIdentifier(current)) {
        if (current.text === 'exports') return bareExports;
        return localObjects.get(current.text);
      }
      if (ts.isPropertyAccessExpression(current) &&
          ts.isIdentifier(current.expression) && current.expression.text === 'module' &&
          current.name.text === 'exports') return exports;
      if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
        const owner = expressionMembers(current.expression, new Set(seen));
        const name = ts.isPropertyAccessExpression(current)
          ? current.name.text : staticName(current.argumentExpression, true);
        return owner && name ? childMembers(owner, name) : undefined;
      }
      if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) &&
          current.expression.text === 'require' && ts.isStringLiteralLike(current.arguments[0])) {
        return membersFromGraph(moduleExports(current.arguments[0].text, targetPath));
      }
      if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) &&
          ts.isIdentifier(current.expression.expression) &&
          current.expression.expression.text === 'Object' &&
          current.expression.name.text === 'assign') {
        const destination = expressionMembers(current.arguments[0], new Set(seen));
        if (!destination) return undefined;
        current.arguments.slice(1).forEach((argument) =>
          mergeStaticMembers(destination, expressionMembers(argument, new Set(seen)))
        );
        return destination;
      }
      if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) &&
          ts.isIdentifier(current.expression.expression) &&
          current.expression.expression.text === 'Object' &&
          current.expression.name.text === 'create') {
        const created = new Map<string, ReceiverProvenance>();
        const prototype = expressionMembers(current.arguments[0], new Set(seen));
        if (prototype) objectPrototypes.set(created, prototype);
        else created.set('*', 'ambiguous');
        return created;
      }
      if (ts.isObjectLiteralExpression(current)) {
        const members = new Map<string, ReceiverProvenance>();
        for (const property of current.properties) {
          if (ts.isSpreadAssignment(property)) {
            const spread = expressionMembers(property.expression, new Set(seen));
            if (!spread) members.set('*', 'ambiguous');
            else for (const [name, provenance] of spread) {
              if (name !== 'default' && ownModuleDescriptor(spread, name)?.enumerable !== false) {
                setModuleData(members, name, mergeProvenance(
                  members.get(name), provenance
                ), childMembers(spread, name));
              }
            }
            continue;
          }
          if (ts.isGetAccessorDeclaration(property)) {
            const name = staticName(property.name);
            if (!name) members.set('*', 'ambiguous');
            else {
              const descriptors = objectDescriptors.get(members) ?? new Map();
              objectDescriptors.set(members, descriptors);
              descriptors.set(name, {
                kind: 'accessor', get: functionReturnProvenance(property),
                writable: false, enumerable: true, configurable: true,
              });
              members.set(name, functionReturnProvenance(property));
            }
            continue;
          }
          if (ts.isSetAccessorDeclaration(property)) {
            members.set(staticName(property.name) ?? '*', 'non-database');
            continue;
          }
          const name = 'name' in property ? staticName(property.name) : undefined;
          if (!name) {
            members.set('*', 'ambiguous');
            continue;
          }
          const provenance = ts.isPropertyAssignment(property)
            ? expressionProvenance(property.initializer)
            : ts.isShorthandPropertyAssignment(property)
              ? locals.get(property.name.text) ?? 'ambiguous'
              : ts.isMethodDeclaration(property)
                ? functionReturnProvenance(property)
                : 'ambiguous';
          setModuleData(members, name, mergeProvenance(members.get(name), provenance));
          if (ts.isPropertyAssignment(property)) {
            const child = expressionMembers(property.initializer, new Set(seen));
            if (child) {
              const children = objectChildren.get(members) ?? new Map();
              objectChildren.set(members, children);
              children.set(name, child);
              const descriptor = ownModuleDescriptor(members, name);
              if (descriptor?.kind === 'data') descriptor.valueMembers = child;
            }
          }
        }
        return members;
      }
      return undefined;
    }
    const expressionProvenance = (
      expression: ts.Expression | undefined,
      seen = new Set<ts.Node>()
    ): ReceiverProvenance => {
      if (!expression || seen.has(expression)) return 'ambiguous';
      seen.add(expression);
      const current = expression.kind === ts.SyntaxKind.ParenthesizedExpression
        ? (expression as ts.ParenthesizedExpression).expression : expression;
      if (ts.isIdentifier(current)) {
        const members = expressionMembers(current);
        return members ? graphAggregate(members) : locals.get(current.text) ?? 'ambiguous';
      }
      if (ts.isCallExpression(current)) return expressionProvenance(current.expression, seen);
      if (ts.isNewExpression(current)) {
        const argumentProvenance = (current.arguments ?? []).map((argument) =>
          expressionProvenance(argument));
        return argumentProvenance.includes('database')
          ? 'database'
          : expressionProvenance(current.expression, seen);
      }
      if (ts.isPropertyAccessExpression(current)) {
        const members = expressionMembers(current.expression, new Set(seen));
        return (members ? memberProvenance(members, current.name.text) : undefined) ??
          expressionProvenance(current.expression, seen);
      }
      if (ts.isElementAccessExpression(current)) {
        const members = expressionMembers(current.expression, new Set(seen));
        const name = staticName(current.argumentExpression, true);
        return (name && members ? memberProvenance(members, name) : undefined) ??
          expressionProvenance(current.expression, seen);
      }
      if (ts.isConditionalExpression(current)) {
        return mergeProvenance(
          expressionProvenance(current.whenTrue, new Set(seen)),
          expressionProvenance(current.whenFalse, new Set(seen))
        );
      }
      if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
        return functionReturnProvenance(current);
      }
      if (ts.isObjectLiteralExpression(current)) return graphAggregate(
        expressionMembers(current, new Set()) ?? new Map()
      );
      return 'non-database';
    };
    const functionReturnProvenance = (node: ts.FunctionLikeDeclaration): ReceiverProvenance => {
      let result: ReceiverProvenance | undefined;
      const inspect = (current: ts.Node): void => {
        if (current !== node && ts.isFunctionLike(current)) return;
        if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) &&
            current.initializer) {
          locals.set(current.name.text, expressionProvenance(current.initializer));
        }
        if (ts.isBinaryExpression(current) &&
            current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(current.left)) {
          locals.set(current.left.text, expressionProvenance(current.right));
        }
        if (ts.isReturnStatement(current) && current.expression) {
          result = mergeProvenance(result, expressionProvenance(current.expression));
          return;
        }
        ts.forEachChild(current, inspect);
      };
      if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
        return expressionProvenance(node.body);
      }
      if (node.body) inspect(node.body);
      return result ?? 'non-database';
    };
    const bindRequire = (name: ts.BindingName, source: string): void => {
      const graph = moduleExports(source, targetPath);
      if (ts.isIdentifier(name)) {
        locals.set(name.text, graph.get('*') ?? importProvenance(source));
      } else if (ts.isObjectBindingPattern(name)) {
        for (const element of name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const imported = element.propertyName &&
            (ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName))
            ? element.propertyName.text : element.name.text;
          locals.set(element.name.text,
            graph.get(imported) ?? graph.get('*') ?? importProvenance(source));
        }
      }
    };

    for (const statement of evaluationStatements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
        const source = statement.moduleSpecifier.text;
        const clause = statement.importClause;
        if (clause?.name) locals.set(clause.name.text, moduleBinding(source, 'default'));
        if (clause?.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            locals.set(clause.namedBindings.name.text,
              moduleExports(source, targetPath).get('*') ?? importProvenance(source));
          } else {
            for (const specifier of clause.namedBindings.elements) {
              locals.set(specifier.name.text, moduleBinding(
                source, specifier.propertyName?.text ?? specifier.name.text
              ));
            }
          }
        }
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const initializer = declaration.initializer;
          if (initializer && ts.isIdentifier(declaration.name)) {
            if (ts.isStringLiteralLike(initializer)) {
              localStrings.set(declaration.name.text, initializer.text);
            }
            const members = expressionMembers(initializer);
            if (members) localObjects.set(declaration.name.text, members);
          }
          if (initializer && ts.isCallExpression(initializer) &&
              ts.isIdentifier(initializer.expression) && initializer.expression.text === 'require' &&
              ts.isStringLiteralLike(initializer.arguments[0])) {
            bindRequire(declaration.name, initializer.arguments[0].text);
          } else if (initializer && ts.isIdentifier(declaration.name)) {
            locals.set(declaration.name.text, expressionProvenance(initializer));
          }
        }
      }
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        locals.set(statement.name.text, functionReturnProvenance(statement));
      }
    }
    type ExportValue = {
      provenance: ReceiverProvenance;
      members?: Map<string, ReceiverProvenance>;
      moduleObject?: boolean;
    };
    const isModuleExports = (expression: ts.Expression): boolean =>
      ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'module' && expression.name.text === 'exports';
    const commonMemberTarget = (
      expression: ts.Expression
    ): { owner: 'exports' | 'module'; name?: string } | undefined => {
      if (ts.isPropertyAccessExpression(expression)) {
        if (ts.isIdentifier(expression.expression) && expression.expression.text === 'exports') {
          return { owner: 'exports', name: expression.name.text };
        }
        if (isModuleExports(expression.expression)) {
          return { owner: 'module', name: expression.name.text };
        }
      }
      if (ts.isElementAccessExpression(expression)) {
        if (ts.isIdentifier(expression.expression) && expression.expression.text === 'exports') {
          return { owner: 'exports', name: staticName(expression.argumentExpression, true) };
        }
        if (isModuleExports(expression.expression)) {
          return { owner: 'module', name: staticName(expression.argumentExpression, true) };
        }
      }
      return undefined;
    };
    const exportValue = (expression: ts.Expression): ExportValue => {
      if (ts.isBinaryExpression(expression) &&
          expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        return applyCommonAssignment(expression);
      }
      const members = expressionMembers(expression);
      return {
        provenance: members ? graphAggregate(members) : expressionProvenance(expression),
        members,
        moduleObject: isModuleExports(expression),
      };
    };
    const replaceModuleExports = (value: ExportValue): void => {
      exports = value.members ?? new Map([['default', value.provenance]]);
    };
    function mergeStaticMembers(
      destination: Map<string, ReceiverProvenance>,
      source: Map<string, ReceiverProvenance> | undefined
    ): void {
      if (!source) {
        destination.set('*', 'ambiguous');
        return;
      }
      for (const [name, provenance] of source) {
        if (name === 'default') continue;
        const descriptor = ownModuleDescriptor(source, name);
        if (descriptor && !descriptor.enumerable) continue;
        moduleWrite(destination, name, provenance, childMembers(source, name));
      }
      const sourceChildren = objectChildren.get(source);
      if (sourceChildren) {
        const destinationChildren = objectChildren.get(destination) ?? new Map();
        objectChildren.set(destination, destinationChildren);
        sourceChildren.forEach((child, name) => {
          if (ownModuleDescriptor(source, name)?.enumerable !== false) {
            destinationChildren.set(name, child);
          }
        });
      }
    }
    function applyCommonAssignment(assignment: ts.BinaryExpression): ExportValue {
      const value = exportValue(assignment.right);
      if (isModuleExports(assignment.left)) {
        sawCommonJsExport = true;
        replaceModuleExports(value);
        return { ...value, members: exports, moduleObject: true };
      }
      if (ts.isIdentifier(assignment.left) && assignment.left.text === 'exports') {
        sawCommonJsExport = true;
        bareExports = value.members ?? new Map([
          ['default', value.provenance],
        ]);
        return { ...value, members: bareExports, moduleObject: bareExports === exports };
      }
      const member = commonMemberTarget(assignment.left);
      if (member) {
        sawCommonJsExport = true;
        const destination = member.owner === 'module'
          ? exports : bareExports;
        if (member.name) moduleWrite(destination, member.name, value.provenance, value.members);
        else destination.set('*', 'ambiguous');
        return value;
      }
      const left = unwrap(assignment.left);
      if (ts.isIdentifier(left)) {
        if (value.members) localObjects.set(left.text, value.members);
        locals.set(left.text, value.provenance);
        return value;
      }
      if (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) {
        const ownerExpression = ts.isPropertyAccessExpression(left)
          ? left.expression : left.expression;
        const destination = expressionMembers(ownerExpression);
        if (destination) {
          const name = ts.isPropertyAccessExpression(left)
            ? left.name.text : staticName(left.argumentExpression, true);
          if (name) moduleWrite(destination, name, value.provenance, value.members);
          else destination.set('*', 'ambiguous');
        }
      }
      return value;
    }
    for (const statement of evaluationStatements) {
      if (ts.isExportDeclaration(statement)) {
        const source = statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text : undefined;
        if (!statement.exportClause && source) {
          for (const [name, provenance] of moduleExports(source, targetPath)) {
            if (name !== 'default' && name !== '*') setExport(name, provenance);
          }
        } else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const specifier of statement.exportClause.elements) {
            const imported = specifier.propertyName?.text ?? specifier.name.text;
            setExport(specifier.name.text, source
              ? moduleBinding(source, imported)
              : locals.get(imported) ?? 'ambiguous');
            if (source) {
              const graph = moduleExports(source, targetPath);
              const stem = `${imported}.`;
              for (const [name, provenance] of graph) {
                if (name.startsWith(stem)) {
                  setExport(`${specifier.name.text}.${name.slice(stem.length)}`, provenance);
                } else if (imported === 'default' && name !== '*' && name !== 'default') {
                  setExport(`${specifier.name.text}.${name}`, provenance);
                }
              }
            }
          }
        } else if (statement.exportClause && ts.isNamespaceExport(statement.exportClause) && source) {
          const namespace = statement.exportClause.name.text;
          const graph = moduleExports(source, targetPath);
          setExport(namespace, graphAggregate(graph));
          for (const [name, provenance] of graph) {
            if (name !== '*' && name !== 'default') {
              setExport(`${namespace}.${name}`, provenance);
            }
          }
        }
      } else if (ts.isExportAssignment(statement)) {
        setExport('default', expressionProvenance(statement.expression));
      } else if (ts.isFunctionDeclaration(statement) && statement.name &&
          statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        setExport(statement.name.text, locals.get(statement.name.text) ?? 'ambiguous');
        if (statement.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
          setExport('default', locals.get(statement.name.text) ?? 'ambiguous');
        }
      } else if (ts.isVariableStatement(statement) &&
          statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            setExport(declaration.name.text, locals.get(declaration.name.text) ?? 'ambiguous');
          }
        }
      } else if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression) &&
          statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        applyCommonAssignment(statement.expression);
      } else if (ts.isExpressionStatement(statement) && ts.isDeleteExpression(statement.expression)) {
        const targetExpression = statement.expression.expression;
        if (ts.isPropertyAccessExpression(targetExpression) ||
            ts.isElementAccessExpression(targetExpression)) {
          const destination = expressionMembers(targetExpression.expression);
          const name = ts.isPropertyAccessExpression(targetExpression)
            ? targetExpression.name.text : staticName(targetExpression.argumentExpression, true);
          if (destination && name) {
            if (ownModuleDescriptor(destination, name)?.configurable !== false) {
              destination.delete(name);
              objectChildren.get(destination)?.delete(name);
              objectDescriptors.get(destination)?.delete(name);
            }
          } else (destination ?? exports).set('*', 'ambiguous');
        }
      } else if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
          ts.isPropertyAccessExpression(statement.expression.expression) &&
          ts.isIdentifier(statement.expression.expression.expression) &&
          statement.expression.expression.expression.text === 'Object' &&
          statement.expression.expression.name.text === 'assign') {
        const call = statement.expression;
        const destination = call.arguments[0];
        const output = destination ? expressionMembers(destination) : undefined;
        if (output) {
          if (output === exports || output === bareExports) sawCommonJsExport = true;
          call.arguments.slice(1).forEach((argument) =>
            mergeStaticMembers(output, expressionMembers(argument))
          );
        }
      } else if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
          ts.isPropertyAccessExpression(statement.expression.expression) &&
          ts.isIdentifier(statement.expression.expression.expression) &&
          statement.expression.expression.expression.text === 'Object' &&
          statement.expression.expression.name.text === 'setPrototypeOf') {
        const destination = expressionMembers(statement.expression.arguments[0]);
        const prototype = expressionMembers(statement.expression.arguments[1]);
        if (destination && prototype) objectPrototypes.set(destination, prototype);
        else (destination ?? exports).set('*', 'ambiguous');
      } else if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
          ts.isPropertyAccessExpression(statement.expression.expression) &&
          ts.isIdentifier(statement.expression.expression.expression) &&
          statement.expression.expression.expression.text === 'Object' &&
          ['defineProperty', 'defineProperties'].includes(statement.expression.expression.name.text)) {
        const call = statement.expression;
        const destination = expressionMembers(call.arguments[0]);
        const applyDescriptor = (
          name: string | undefined,
          expression: ts.Expression | undefined
        ): void => {
          const descriptorExpression = expression && ts.isObjectLiteralExpression(
            ts.isParenthesizedExpression(expression) ? expression.expression : expression
          ) ? (ts.isParenthesizedExpression(expression)
              ? expression.expression : expression) as ts.ObjectLiteralExpression
            : undefined;
          const aliasedDescriptor = expressionMembers(expression);
          if (!destination || !name || (!descriptorExpression && !aliasedDescriptor)) {
            (destination ?? exports).set('*', 'ambiguous');
            return;
          }
          if (!descriptorExpression && aliasedDescriptor) {
            const value = memberProvenance(aliasedDescriptor, 'value');
            const getter = memberProvenance(aliasedDescriptor, 'get');
            const setter = memberProvenance(aliasedDescriptor, 'set');
            if (getter || setter) {
              const descriptors = objectDescriptors.get(destination) ?? new Map();
              objectDescriptors.set(destination, descriptors);
              descriptors.set(name, {
                kind: 'accessor', get: getter, set: setter, writable: false,
                enumerable: false, configurable: false,
              });
              destination.set(name, getter ?? 'non-database');
            } else {
              setModuleData(destination, name, value ?? 'ambiguous',
                childMembers(aliasedDescriptor, 'value'), {
                  writable: false, enumerable: false, configurable: false,
                });
            }
            if (destination === exports || destination === bareExports) sawCommonJsExport = true;
            return;
          }
          const literal = descriptorExpression!;
          const field = (fieldName: string): ts.ObjectLiteralElementLike | undefined =>
            literal.properties.find((property) =>
              'name' in property && staticName(property.name) === fieldName);
          const fieldExpression = (
            property: ts.ObjectLiteralElementLike | undefined
          ): ts.Expression | undefined => {
            if (!property) return undefined;
            if (ts.isPropertyAssignment(property)) return property.initializer;
            return ts.isShorthandPropertyAssignment(property) ? property.name : undefined;
          };
          const booleanField = (fieldName: string): boolean | undefined => {
            const value = fieldExpression(field(fieldName));
            return value?.kind === ts.SyntaxKind.TrueKeyword ? true
              : value?.kind === ts.SyntaxKind.FalseKeyword ? false : undefined;
          };
          const current = ownModuleDescriptor(destination, name);
          const valueProperty = field('value');
          const getterProperty = field('get');
          const setterProperty = field('set');
          const writableProperty = field('writable');
          const enumerable = booleanField('enumerable') ?? current?.enumerable ?? false;
          const configurable = booleanField('configurable') ?? current?.configurable ?? false;
          if (getterProperty || setterProperty) {
            const getterNode = getterProperty && (ts.isMethodDeclaration(getterProperty) ||
              ts.isGetAccessorDeclaration(getterProperty)) ? getterProperty : undefined;
            const getterExpression = fieldExpression(getterProperty);
            const getter = getterNode ? functionReturnProvenance(getterNode)
              : getterExpression ? expressionProvenance(getterExpression) : undefined;
            let getThisProperty: string | undefined;
            const getterFunction = getterNode ?? (getterExpression &&
              (ts.isArrowFunction(getterExpression) || ts.isFunctionExpression(getterExpression))
              ? getterExpression : undefined);
            if (getterFunction?.body && ts.isBlock(getterFunction.body)) {
              const returned = getterFunction.body.statements.find(ts.isReturnStatement)?.expression;
              if (returned && ts.isPropertyAccessExpression(returned) &&
                  returned.expression.kind === ts.SyntaxKind.ThisKeyword) {
                getThisProperty = returned.name.text;
              }
            }
            const descriptors = objectDescriptors.get(destination) ?? new Map();
            objectDescriptors.set(destination, descriptors);
            descriptors.set(name, {
              kind: 'accessor', get: getter, getThisProperty,
              set: setterProperty ? 'non-database' : undefined,
              writable: false, enumerable, configurable,
            });
            destination.set(name, getThisProperty
              ? memberProvenance(destination, getThisProperty, new Set()) ?? 'ambiguous'
              : getter ?? 'ambiguous');
            objectChildren.get(destination)?.delete(name);
          } else {
            const valueExpression = fieldExpression(valueProperty);
            const provenance = valueExpression ? expressionProvenance(valueExpression)
              : current?.kind === 'data' ? current.value ?? 'non-database' : 'non-database';
            setModuleData(destination, name, provenance,
              valueExpression ? expressionMembers(valueExpression) :
                current?.kind === 'data' ? current.valueMembers : undefined,
              {
                writable: booleanField('writable') ??
                  (current?.kind === 'data' ? current.writable : false),
                enumerable,
                configurable,
              });
          }
          if (destination === exports || destination === bareExports) sawCommonJsExport = true;
        };
        if (statement.expression.expression.name.text === 'defineProperty') {
          applyDescriptor(
            call.arguments[1] ? staticName(call.arguments[1], true) : undefined,
            call.arguments[2]
          );
        } else {
          const descriptors = call.arguments[1] && ts.isObjectLiteralExpression(call.arguments[1])
            ? call.arguments[1] : undefined;
          if (!descriptors) applyDescriptor(undefined, undefined);
          else descriptors.properties.forEach((property) => {
            const name = 'name' in property ? staticName(property.name) : undefined;
            applyDescriptor(name, ts.isPropertyAssignment(property) ? property.initializer : undefined);
          });
        }
      }
    }
    const resolvedExports = flattenMembers(exports);
    if (sawCommonJsExport) {
      const defaultProvenance = graphAggregate(exports);
      if (!resolvedExports.has('default')) resolvedExports.set('default', defaultProvenance);
      for (const [name, provenance] of [...exports]) {
        if (name !== '*' && name !== 'default' && !name.startsWith('default.')) {
          resolvedExports.set(`default.${name}`, provenance);
        }
      }
    }
    const aggregate = [...resolvedExports.values()].reduce<ReceiverProvenance | undefined>(
      (result, provenance) => mergeProvenance(result, provenance), undefined
    );
    resolvedExports.set('*', aggregate ?? 'ambiguous');
    if (moduleThrows) resolvedExports.set('#throws', 'ambiguous');
    activeModuleExports.delete(targetPath);
    moduleExportCache.set(targetPath, resolvedExports);
    return resolvedExports;
  }

  function importedValue(
    moduleName: string,
    importedName: string,
    importerPath = file.startsWith('/') ? file : join(ROOT, file)
  ): AbstractValue {
    const graph = moduleExports(moduleName, importerPath);
    const localModule = Boolean(resolveModulePath(moduleName, importerPath));
    const graphValue = (prefix: string): AbstractValue => {
      const childNames = new Set<string>();
      const stem = prefix ? `${prefix}.` : '';
      for (const name of graph.keys()) {
        if (name === '*' || name === '#cycle' || name === '#throws' ||
            (prefix === '' && name === 'default')) continue;
        if (!name.startsWith(stem)) continue;
        const remainder = name.slice(stem.length);
        if (remainder) childNames.add(remainder.split('.')[0]);
      }
      const properties = new Map<string, AbstractValue>();
      for (const child of childNames) {
        const qualified = stem + child;
        properties.set(child, graphValue(qualified));
      }
      const receiverProvenance = prefix === '' && localModule
        ? graph.get('*') ?? 'ambiguous'
        : graph.get(prefix) ??
          ([...graph.keys()].some((name) => name.startsWith(`${prefix}.`))
            ? 'non-database'
            : localModule ? graph.get('*') ?? 'ambiguous'
              : graph.get('*') ?? importProvenance(moduleName));
      return valueOf({
        properties,
        receiverProvenance,
        external: receiverProvenance === 'ambiguous',
        exactShape: localModule && receiverProvenance !== 'ambiguous',
      });
    };
    const imported = graphValue(importedName === '*' ? '' : importedName);
    imported.alwaysThrows = graph.has('#throws');
    return imported;
  }

  function selectedProperty(base: AbstractValue, property: string): AbstractValue {
    const stored = readAbstractProperty(base, property);
    if (stored) return stored;
    if (/^(?:0|[1-9]\d*)$/.test(property) && base.tupleElements) {
      return base.tupleElements[Number(property)] ?? valueOf({
        external: base.external,
        callableCandidate: base.external,
      });
    }
    if (property === 'concat' && (base.tupleElements || base.elements)) {
      return valueOf({
        sequenceBuilder: 'concat',
        sequenceSource: base,
        callableCandidate: true,
      });
    }
    if ((base.tupleElements || base.elements) &&
        (['push', 'pop', 'shift', 'unshift', 'splice', 'reverse', 'fill',
          'copyWithin', 'sort'] as SequenceMutationName[]).includes(
          property as SequenceMutationName
        )) {
      return valueOf({
        sequenceMutation: property as SequenceMutationName,
        sequenceMutationTarget: base,
        callableCandidate: true,
      });
    }
    if (property === 'call' || property === 'apply' || property === 'bind') {
      return valueOf({
        adapter: property,
        adapterCallable: base,
        callableCandidate: base.callableCandidate,
        external: base.external,
        receiverProvenance: base.receiverProvenance,
      });
    }
    if (property === 'from' || property === 'rpc') {
      if (base.receiverProvenance === 'non-database' && !base.external) {
        return valueOf({ receiverProvenance: 'non-database' });
      }
      if (base.receiverProvenance === 'ambiguous') {
        return valueOf({
          external: true,
          receiverProvenance: 'ambiguous',
        });
      }
      return valueOf({
        methods: new Set([property]),
        callableCandidate: true,
        receiverProvenance: base.receiverProvenance,
      });
    }
    if (base.receiverProvenance) {
      const ambiguous = base.receiverProvenance === 'ambiguous';
      return valueOf({
        receiverProvenance: ambiguous ? 'ambiguous' : base.receiverProvenance,
        external: ambiguous,
      });
    }
    const closedPrototypeChain = (
      object: AbstractValue,
      seen = new Set<AbstractValue>()
    ): boolean => {
      if (seen.has(object) || object.external || !object.exactShape) return false;
      seen.add(object);
      return !object.prototype || closedPrototypeChain(object.prototype, seen);
    };
    if (closedPrototypeChain(base)) {
      return valueOf({ primitives: new Set(['undefined']) });
    }
    return valueOf({ external: true });
  }

  function resolveValue(input: ts.Expression | undefined): AbstractValue {
    if (!input) return valueOf({ external: true });
    const node = unwrap(input);
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return valueOf({ strings: new Set([node.text]) });
    }
    if (ts.isNumericLiteral(node)) {
      return valueOf({ numbers: new Set([Number(node.text)]) });
    }
    if (node.kind === ts.SyntaxKind.NullKeyword) {
      return valueOf({ primitives: new Set(['null']) });
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
      return valueOf({ primitives: new Set([
        node.kind === ts.SyntaxKind.TrueKeyword ? 'true' : 'false',
      ]) });
    }
    if (ts.isPrefixUnaryExpression(node) &&
        (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)) {
      const operand = resolveValue(node.operand);
      if (!operand.external && operand.numbers.size > 0) {
        return valueOf({ numbers: new Set([...operand.numbers].map((number) =>
          node.operator === ts.SyntaxKind.MinusToken ? -number : number
        )) });
      }
      return valueOf({ external: true });
    }
    if (ts.isRegularExpressionLiteral(node)) {
      return valueOf({ receiverProvenance: 'non-database' });
    }
    if (ts.isIdentifier(node)) {
      const resolved = binding(node.text);
      if (resolved) return resolved;
      if (node.text === 'Reflect') return reflectValue();
      if (node.text === 'Function') return functionConstructorValue();
      if (node.text === 'Array') return arrayConstructorValue();
      if (node.text === 'undefined') return valueOf({ primitives: new Set(['undefined']) });
      if (node.text === 'true') return valueOf({ primitives: new Set(['true']) });
      if (node.text === 'false') return valueOf({ primitives: new Set(['false']) });
      if (node.text === 'Buffer') {
        return valueOf({ receiverProvenance: 'non-database' });
      }
      return valueOf({ external: true });
    }
    if (node.kind === ts.SyntaxKind.ThisKeyword) {
      return receiverStack.at(-1) ?? valueOf({ external: true });
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const captured = functionClosures.get(node) ?? new Map<string, AbstractValue>();
      for (const scope of scopes) {
        for (const [name, value] of scope) {
          captured.set(name, captured.has(name) ? unionValues(captured.get(name)!, value) : value);
        }
      }
      functionClosures.set(node, captured);
      return valueOf({ functions: new Set([node]) });
    }
    if (ts.isClassExpression(node)) return classValue(node);
    if (ts.isNewExpression(node)) {
      const callable = resolveValue(node.expression);
      if (!callable.sequenceBuilder) return callable;
      return evaluateCallable(
        callable,
        invocationArgumentValues(node.arguments ?? ts.factory.createNodeArray()),
        undefined,
        {
          record: false,
          node: node as unknown as ts.CallExpression,
          expression: node.expression.getText(sf),
        }
      );
    }
    if (ts.isConditionalExpression(node)) {
      return unionValues(resolveValue(node.whenTrue), resolveValue(node.whenFalse));
    }
    if (ts.isArrayLiteralExpression(node)) {
      const tupleElements = node.elements.flatMap((entry) => {
        if (ts.isOmittedExpression(entry)) return [valueOf()];
        if (!ts.isSpreadElement(entry)) return [resolveValue(entry)];
        const spread = resolveValue(entry.expression);
        return spread.tupleElements ?? [unionValues(
          spread.elements ?? valueOf(),
          valueOf({ external: spread.external || !spread.elements })
        )];
      });
      return coherentSequence(tupleElements);
    }
    if (ts.isObjectLiteralExpression(node)) {
      const object = valueOf({ exactShape: true });
      let external = false;
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = resolveValue(property.expression);
          external ||= spread.external;
          for (const name of new Set([...spread.properties.keys(), ...spread.descriptors.keys()])) {
            const descriptor = ownDescriptor(spread, name);
            if (!descriptor?.enumerable) continue;
            const spreadValue = readAbstractProperty(spread, name);
            if (spreadValue) setDataDescriptor(object, name, spreadValue);
          }
        } else if (ts.isPropertyAssignment(property)) {
          const name = readPropertyName(property.name);
          if (name) setDataDescriptor(object, name, resolveValue(property.initializer));
        } else if (ts.isShorthandPropertyAssignment(property)) {
          setDataDescriptor(object, property.name.text, resolveValue(property.name));
        } else if (ts.isMethodDeclaration(property)) {
          const name = readPropertyName(property.name);
          if (name) setDataDescriptor(object, name, functionValue(property));
        } else if (ts.isGetAccessorDeclaration(property)) {
          const name = readPropertyName(property.name);
          if (name) setAccessorDescriptor(object, name, functionValue(property), undefined);
        } else if (ts.isSetAccessorDeclaration(property)) {
          const name = readPropertyName(property.name);
          if (name) {
            const prior = ownDescriptor(object, name);
            setAccessorDescriptor(object, name,
              prior?.kind === 'accessor' ? prior.get : undefined,
              functionValue(property));
          }
        }
      }
      object.external = external;
      return object;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'Object' &&
        ['freeze', 'seal', 'preventExtensions'].includes(node.expression.name.text)) {
      const target = resolveValue(node.arguments[0]);
      target.integrity = node.expression.name.text === 'freeze' ? 'frozen'
        : node.expression.name.text === 'seal' ? 'sealed' : 'nonextensible';
      if (target.integrity === 'sealed' || target.integrity === 'frozen') {
        for (const descriptor of target.descriptors.values()) {
          descriptor.configurable = false;
          if (target.integrity === 'frozen' && descriptor.kind === 'data') {
            descriptor.writable = false;
          }
        }
      }
      return target;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'Object' && node.expression.name.text === 'assign') {
      return resolveValue(node.arguments[0]);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'Object' && node.expression.name.text === 'create') {
      const prior = functionStack.length === 0 ? topLevelExpressionResults.get(node) : undefined;
      if (prior) return prior;
      const created = valueOf({ prototype: resolveValue(node.arguments[0]), exactShape: true });
      const descriptors = node.arguments[1] ? resolveValue(node.arguments[1]) : undefined;
      if (descriptors) {
        for (const name of descriptorNames(descriptors)) {
          if (!ownDescriptor(descriptors, name)?.enumerable) continue;
          const descriptor = readAbstractProperty(descriptors, name, descriptors);
          if (!descriptor) continue;
          const conversion = convertPropertyDescriptor(descriptor);
          if (!conversion.valid || conversion.abrupt || conversion.uncertain ||
              !applyPropertyDescriptor(created, name, conversion.descriptor)) {
            return valueOf({ alwaysThrows: true });
          }
        }
      }
      return created;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'Object' &&
        ['getOwnPropertyDescriptor', 'getOwnPropertyDescriptors', 'getPrototypeOf']
          .includes(node.expression.name.text)) {
      const target = resolveValue(node.arguments[0]);
      if (node.expression.name.text === 'getPrototypeOf') {
        return target.prototype ?? valueOf({ primitives: new Set(['null']) });
      }
      if (node.expression.name.text === 'getOwnPropertyDescriptors') {
        const descriptors = valueOf({ exactShape: target.exactShape });
        for (const name of descriptorNames(target)) {
          const descriptor = ownDescriptor(target, name);
          if (descriptor) setDataDescriptor(descriptors, name, descriptorObjectValue(descriptor));
        }
        return descriptors;
      }
      const keys = resolveValue(node.arguments[1]);
      if (keys.external || (keys.strings.size === 0 && keys.numbers.size === 0)) {
        return valueOf({ external: true, callableCandidate: hasExecutableProvenance(target) });
      }
      const values = [...keys.strings, ...[...keys.numbers].map(String)].map((name) => {
        const descriptor = ownDescriptor(target, name);
        return descriptor ? descriptorObjectValue(descriptor) : valueOf({
          primitives: new Set(['undefined']),
        });
      });
      return unionValues(...values);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'Reflect' &&
        ['get', 'getOwnPropertyDescriptor', 'getPrototypeOf'].includes(node.expression.name.text)) {
      const target = resolveValue(node.arguments[0]);
      if (node.expression.name.text === 'getPrototypeOf') {
        return target.prototype ?? valueOf({ primitives: new Set(['null']) });
      }
      const keys = resolveValue(node.arguments[1]);
      if (keys.external || (keys.strings.size === 0 && keys.numbers.size === 0)) {
        return valueOf({ external: true, callableCandidate: hasExecutableProvenance(target) });
      }
      if (node.expression.name.text === 'getOwnPropertyDescriptor') {
        return unionValues(...[...keys.strings, ...[...keys.numbers].map(String)].map((name) => {
          const descriptor = ownDescriptor(target, name);
          return descriptor ? descriptorObjectValue(descriptor) : valueOf({
            primitives: new Set(['undefined']),
          });
        }));
      }
      const receiver = node.arguments[2] ? resolveValue(node.arguments[2]) : target;
      return unionValues(...[...keys.strings, ...[...keys.numbers].map(String)].map((name) =>
        readAbstractProperty(target, name, receiver) ?? valueOf({
          primitives: new Set(['undefined']),
        })
      ));
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require' &&
          ts.isStringLiteralLike(node.arguments[0])) {
        return importedValue(node.arguments[0].text, '*');
      }
      const priorResult = functionStack.length === 0
        ? topLevelExpressionResults.get(node) : undefined;
      if (priorResult) return priorResult;
      const callable = resolveValue(node.expression);
      const receiver = ts.isPropertyAccessExpression(node.expression) ||
        ts.isElementAccessExpression(node.expression)
        ? resolveValue(node.expression.expression) : undefined;
      return evaluateCallable(
        callable,
        invocationArgumentValues(node.arguments),
        receiver,
        {
          record: false,
          node,
          expression: node.expression.getText(sf),
          targetExpression: node.arguments[0]?.getText(sf),
        }
      );
    }
    if (ts.isPropertyAccessExpression(node)) {
      const property = node.name.text;
      const base = resolveValue(node.expression);
      if (receiverExcluded(node.expression)) return valueOf({ receiverProvenance: 'non-database' });
      return selectedProperty(base, property);
    }
    if (ts.isElementAccessExpression(node)) {
      if (receiverExcluded(node.expression)) return valueOf();
      const base = resolveValue(node.expression);
      const key = resolveValue(node.argumentExpression);
      if (!key.external && key.numbers.size > 0 && base.tupleElements) {
        return unionValues(...[...key.numbers].map((index) =>
          base.tupleElements?.[index] ?? base.properties.get(String(index)) ?? valueOf({
            external: base.external,
            callableCandidate: base.external,
          })
        ));
      }
      if (!key.external && key.strings.size > 0) {
        const selected = [...key.strings].map((name) => selectedProperty(base, name));
        return unionValues(...selected);
      }
      if (base.elements) return base.elements;
      if (base.properties.size > 0) return unionValues(...base.properties.values());
      if (base.receiverProvenance === 'non-database' && !base.external) {
        return valueOf({ receiverProvenance: 'non-database' });
      }
      return valueOf({ external: true, callableCandidate: true });
    }
    return valueOf({ external: true });
  }

  function propertyNames(name: ts.PropertyName | undefined): AbstractValue {
    if (!name) return valueOf({ external: true });
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
      return valueOf({ strings: new Set([name.text]) });
    }
    if (ts.isNumericLiteral(name)) return valueOf({ numbers: new Set([Number(name.text)]) });
    if (ts.isComputedPropertyName(name)) return resolveValue(name.expression);
    return valueOf({ external: true });
  }

  function hasAbstractFacts(value: AbstractValue): boolean {
    return value.strings.size > 0 || value.numbers.size > 0 || value.methods.size > 0 ||
      value.properties.size > 0 || Boolean(value.elements) || Boolean(value.tupleElements) ||
      value.external || value.callableCandidate || value.functions.size > 0 ||
      Boolean(value.boundArguments) || Boolean(value.boundReceiver) || Boolean(value.adapter) ||
      Boolean(value.receiverProvenance) || Boolean(value.sequenceBuilder) ||
      Boolean(value.sequenceSource) || value.primitives.size > 0;
  }

  function applyBindingDefault(
    selected: AbstractValue,
    initializer: ts.Expression | undefined,
    exactValue: boolean
  ): AbstractValue {
    if (!initializer) return selected;
    if (exactValue && hasAbstractFacts(selected)) return selected;
    const fallback = resolveValue(initializer);
    return hasAbstractFacts(selected) ? unionValues(selected, fallback) : fallback;
  }

  function arrayElementValue(
    source: AbstractValue,
    index: number
  ): { value: AbstractValue; exact: boolean } {
    if (source.tupleElements) {
      const positional = source.tupleElements[index] ?? valueOf();
      return {
        value: source.external
          ? unionValues(positional, valueOf({
              external: true,
              callableCandidate: source.receiverProvenance !== 'ambiguous',
            }))
          : positional,
        exact: !source.external,
      };
    }
    if (source.elements) {
      return {
      value: unionValues(source.elements, valueOf({
          external: source.external,
          callableCandidate: source.external && source.receiverProvenance !== 'ambiguous',
        })),
        exact: false,
      };
    }
    return {
      value: valueOf({
        external: source.external,
        callableCandidate: source.external && source.receiverProvenance !== 'ambiguous',
      }),
      exact: !source.external,
    };
  }

  function arrayRestValue(source: AbstractValue, index: number): AbstractValue {
    const tupleElements = source.tupleElements?.slice(index);
    const candidates = [
      ...(tupleElements ?? []),
      ...(source.elements ? [source.elements] : []),
    ];
    return valueOf({
      tupleElements,
      elements: candidates.length > 0 ? unionValues(...candidates) : undefined,
      external: source.external,
      callableCandidate: source.external && source.receiverProvenance !== 'ambiguous',
    });
  }

  function objectPropertyValue(source: AbstractValue, names: AbstractValue): AbstractValue {
    if (names.external || (names.strings.size === 0 && names.numbers.size === 0)) {
      return valueOf({ external: true });
    }
    return unionValues(
      ...[...names.strings].map((name) => selectedProperty(source, name)),
      ...[...names.numbers].map((index) => {
        if (source.tupleElements) return source.tupleElements[index] ?? valueOf();
        return selectedProperty(source, String(index));
      })
    );
  }

  function bindName(
    name: ts.BindingName,
    source: AbstractValue,
    initializer?: ts.Expression,
    exactValue = true
  ): void {
    const resolved = applyBindingDefault(source, initializer, exactValue);
    if (ts.isIdentifier(name)) {
      scopes[scopes.length - 1].set(name.text, resolved);
      return;
    }
    if (ts.isArrayBindingPattern(name)) {
      name.elements.forEach((element, index) => {
        if (ts.isOmittedExpression(element)) return;
        if (element.dotDotDotToken) {
          bindName(element.name, arrayRestValue(resolved, index), element.initializer, true);
          return;
        }
        const selected = arrayElementValue(resolved, index);
        bindName(element.name, selected.value, element.initializer, selected.exact);
      });
      return;
    }

    const consumed = new Set<string>();
    for (const element of name.elements) {
      if (element.dotDotDotToken) {
        const properties = new Map([...resolved.properties]
          .filter(([property]) => !consumed.has(property)));
        bindName(element.name, valueOf({
          properties,
          external: resolved.external,
          receiverProvenance: resolved.receiverProvenance,
        }), element.initializer, true);
        continue;
      }
      const names = element.propertyName
        ? propertyNames(element.propertyName)
        : ts.isIdentifier(element.name)
          ? valueOf({ strings: new Set([element.name.text]) })
          : valueOf({ external: true });
      names.strings.forEach((property) => consumed.add(property));
      bindName(element.name, objectPropertyValue(resolved, names), element.initializer,
        !names.external);
    }
  }

  function declareName(
    name: ts.BindingName,
    initializer?: ts.Expression,
    explicitValue?: AbstractValue
  ): void {
    bindName(name, explicitValue ?? (initializer ? resolveValue(initializer) : valueOf()));
  }

  function assign(name: string, value: AbstractValue): void {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      if (scopes[index].has(name)) {
        scopes[index].set(name, value);
        return;
      }
    }
    scopes[scopes.length - 1].set(name, valueOf({ external: true }));
  }

  function writeSequencePosition(base: AbstractValue, index: number, value: AbstractValue): void {
    if ((base.sequenceAliases?.size ?? 0) > 1) {
      weakHeapUpdateDepth += 1;
      try {
        base.sequenceAliases!.forEach((alias) => writeSequencePosition(alias, index, value));
      } finally {
        weakHeapUpdateDepth -= 1;
      }
      invalidateSequence(base, [value]);
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index > 4096) {
      invalidateSequence(base, [value]);
      return;
    }
    const tuple = base.tupleElements ?? [];
    while (tuple.length <= index) tuple.push(valueOf());
    tuple[index] = weakHeapUpdateDepth > 0 && hasAbstractFacts(tuple[index])
      ? unionValues(tuple[index], value) : value;
    base.tupleElements = tuple;
    const descriptor = ownDescriptor(base, String(index));
    if (descriptor?.kind === 'data') descriptor.value = tuple[index];
    else setDataDescriptor(base, String(index), tuple[index]);
    base.properties.set(String(index), tuple[index]);
    const lengthValue = valueOf({ numbers: new Set([tuple.length]) });
    const lengthDescriptor = ownDescriptor(base, 'length');
    if (lengthDescriptor?.kind === 'data') lengthDescriptor.value = lengthValue;
    base.properties.set('length', lengthValue);
    base.elements = tuple.length > 0 ? unionValues(...tuple) : undefined;
  }

  function abstractTruthiness(value: AbstractValue): 'truthy' | 'falsy' | 'unknown' {
    let truthy = value.methods.size > 0 || value.functions.size > 0 || value.properties.size > 0 ||
      Boolean(value.tupleElements) || Boolean(value.elements) || Boolean(value.adapter) ||
      Boolean(value.sequenceBuilder) || Boolean(value.sequenceMutation) ||
      value.receiverProvenance !== undefined || value.callableCandidate;
    let falsy = false;
    value.strings.forEach((entry) => { if (entry.length > 0) truthy = true; else falsy = true; });
    value.numbers.forEach((entry) => {
      if (entry === 0 || Number.isNaN(entry)) falsy = true;
      else truthy = true;
    });
    value.primitives.forEach((entry) => {
      if (entry === 'true') truthy = true;
      else falsy = true;
    });
    if (value.external || (!truthy && !falsy && value.primitives.size === 0)) return 'unknown';
    return truthy && !falsy ? 'truthy' : falsy && !truthy ? 'falsy' : 'unknown';
  }

  function abstractNullishness(value: AbstractValue): 'nullish' | 'non-nullish' | 'unknown' {
    const nullish = value.primitives.has('null') || value.primitives.has('undefined');
    const nonNullish = value.strings.size > 0 || value.numbers.size > 0 || value.methods.size > 0 ||
      value.functions.size > 0 || value.properties.size > 0 || Boolean(value.tupleElements) ||
      Boolean(value.elements) || Boolean(value.receiverProvenance) || value.primitives.has('true') ||
      value.primitives.has('false');
    if (value.external || (!nullish && !nonNullish)) return 'unknown';
    return nullish && !nonNullish ? 'nullish' : nonNullish && !nullish ? 'non-nullish' : 'unknown';
  }

  function propertyKey(target: ts.Expression): { base: AbstractValue; keys: AbstractValue } | undefined {
    const current = unwrap(target);
    if (ts.isPropertyAccessExpression(current)) {
      return { base: resolveValue(current.expression), keys: valueOf({
        strings: new Set([current.name.text]),
      }) };
    }
    if (ts.isElementAccessExpression(current)) {
      return { base: resolveValue(current.expression), keys: resolveValue(current.argumentExpression) };
    }
    return undefined;
  }

  function resizeSequence(base: AbstractValue, nextLength: number): void {
    if (!Number.isInteger(nextLength) || nextLength < 0 || nextLength > 4096 ||
        !base.tupleElements) {
      invalidateSequence(base, []);
      return;
    }
    if ((base.integrity === 'frozen' || base.integrity === 'sealed') &&
        nextLength < base.tupleElements.length) return;
    const tuple = [...base.tupleElements];
    if (nextLength < tuple.length) tuple.length = nextLength;
    else while (tuple.length < nextLength) tuple.push(valueOf());
    refreshSequence(base, tuple);
  }

  function exactBoolean(value: AbstractValue | undefined): boolean | undefined {
    if (!value || value.external || value.primitives.size !== 1) return undefined;
    const primitive = [...value.primitives][0];
    return primitive === 'true' ? true : primitive === 'false' ? false : undefined;
  }

  function descriptorObjectValue(
    descriptor: AbstractPropertyDescriptor
  ): AbstractValue {
    const object = valueOf({ exactShape: true });
    if (descriptor.kind === 'data') {
      setDataDescriptor(object, 'value', descriptor.value ?? valueOf({
        primitives: new Set(['undefined']),
      }));
      setDataDescriptor(object, 'writable', valueOf({
        primitives: new Set([descriptor.writable ? 'true' : 'false']),
      }));
    } else {
      setDataDescriptor(object, 'get', descriptor.get ?? valueOf({
        primitives: new Set(['undefined']),
      }));
      setDataDescriptor(object, 'set', descriptor.set ?? valueOf({
        primitives: new Set(['undefined']),
      }));
    }
    setDataDescriptor(object, 'enumerable', valueOf({
      primitives: new Set([descriptor.enumerable ? 'true' : 'false']),
    }));
    setDataDescriptor(object, 'configurable', valueOf({
      primitives: new Set([descriptor.configurable ? 'true' : 'false']),
    }));
    return object;
  }

  interface DescriptorConversion {
    descriptor: AbstractValue;
    valid: boolean;
    abrupt: boolean;
    uncertain: boolean;
  }

  function convertPropertyDescriptor(
    descriptorObject: AbstractValue
  ): DescriptorConversion {
    const converted = valueOf({ exactShape: true });
    let abrupt = false;
    let uncertain = descriptorObject.external;
    const fields = ['enumerable', 'configurable', 'value', 'writable', 'get', 'set'] as const;
    const present = new Set<string>();
    for (const name of fields) {
      if (!ownDescriptor(descriptorObject, name)) continue;
      present.add(name);
      const value = readAbstractProperty(descriptorObject, name, descriptorObject) ?? valueOf({
        primitives: new Set(['undefined']),
      });
      abrupt ||= value.alwaysThrows;
      if (name !== 'value') uncertain ||= value.external;
      setDataDescriptor(converted, name, value);
    }
    const data = present.has('value') || present.has('writable');
    const accessor = present.has('get') || present.has('set');
    let valid = !(data && accessor);
    for (const name of ['get', 'set'] as const) {
      const value = readAbstractProperty(converted, name);
      if (!value) continue;
      const undefinedOnly = value.primitives.size === 1 && value.primitives.has('undefined') &&
        !hasExecutableProvenance(value) && !value.external;
      if (!undefinedOnly && value.functions.size === 0 && !value.adapter && !value.external) {
        valid = false;
      }
    }
    return { descriptor: converted, valid, abrupt, uncertain };
  }

  function applyPropertyDescriptor(
    target: AbstractValue,
    name: string,
    descriptorObject: AbstractValue
  ): boolean {
    const current = ownDescriptor(target, name);
    const valueField = ownDescriptor(descriptorObject, 'value');
    const getField = ownDescriptor(descriptorObject, 'get');
    const setField = ownDescriptor(descriptorObject, 'set');
    const writableField = ownDescriptor(descriptorObject, 'writable');
    const enumerableField = ownDescriptor(descriptorObject, 'enumerable');
    const configurableField = ownDescriptor(descriptorObject, 'configurable');
    const data = Boolean(valueField || writableField);
    const accessor = Boolean(getField || setField);
    if (data && accessor) return false;
    if (valueField?.value?.external && !hasExecutableProvenance(valueField.value)) {
      valueField.value.callableCandidate = true;
    }
    if (!current && ['nonextensible', 'sealed', 'frozen'].includes(
      target.integrity ?? 'extensible'
    )) return false;
    const nextKind = accessor ? 'accessor' : data ? 'data' : current?.kind ?? 'data';
    if (current && !current.configurable) {
      const requestedConfigurable = exactBoolean(configurableField?.value);
      const requestedEnumerable = exactBoolean(enumerableField?.value);
      if (requestedConfigurable === true ||
          (requestedEnumerable !== undefined && requestedEnumerable !== current.enumerable) ||
          nextKind !== current.kind) return false;
      if (current.kind === 'data' && !current.writable) {
        if (exactBoolean(writableField?.value) === true) return false;
        if (valueField && valueField.value !== current.value) return false;
      }
      if (current.kind === 'accessor' &&
          ((getField && getField.value !== current.get) ||
           (setField && setField.value !== current.set))) return false;
    }
    const enumerable = exactBoolean(enumerableField?.value) ?? current?.enumerable ?? false;
    const configurable = exactBoolean(configurableField?.value) ?? current?.configurable ?? false;
    if (nextKind === 'accessor') {
      setAccessorDescriptor(
        target,
        name,
        getField?.value ?? (current?.kind === 'accessor' ? current.get : undefined),
        setField?.value ?? (current?.kind === 'accessor' ? current.set : undefined),
        { enumerable, configurable }
      );
    } else {
      const nextValue = valueField?.value ??
        (current?.kind === 'data' ? current.value : undefined) ??
        valueOf({ primitives: new Set(['undefined']) });
      setDataDescriptor(target, name, nextValue, {
        writable: exactBoolean(writableField?.value) ??
          (current?.kind === 'data' ? current.writable : false),
        enumerable,
        configurable,
      });
      if (/^(?:0|[1-9]\d*)$/.test(name) && target.tupleElements) {
        const index = Number(name);
        while (target.tupleElements.length <= index) target.tupleElements.push(valueOf());
        target.tupleElements[index] = nextValue;
        target.elements = unionValues(...target.tupleElements);
      }
    }
    return true;
  }

  function descriptorNames(value: AbstractValue): string[] {
    return [...new Set([...value.properties.keys(), ...value.descriptors.keys()])];
  }

  function writeAbstractProperty(
    base: AbstractValue,
    keys: AbstractValue,
    value: AbstractValue,
    receiver = base
  ): boolean {
    if (keys.external || (keys.strings.size === 0 && keys.numbers.size === 0)) {
      invalidateSequence(receiver, [value]);
      return false;
    }
    const names = new Set([...keys.strings, ...[...keys.numbers].map(String)]);
    let failed = false;

    const setOne = (
      target: AbstractValue,
      name: string,
      seen = new Set<AbstractValue>()
    ): boolean => {
      if (seen.has(target)) return true;
      seen.add(target);
      let descriptor = ownDescriptor(target, name);
      if (!descriptor && target.prototype) {
        return setOne(target.prototype, name, seen);
      }
      descriptor ??= {
        kind: 'data', value: valueOf({ primitives: new Set(['undefined']) }),
        writable: true, enumerable: true, configurable: true,
      };
      if (descriptor.kind === 'accessor') {
        if (!descriptor.set) return true;
        const outputs = [...descriptor.set.functions]
          .map((setter) => invokeFunction(setter, [value], receiver));
        return outputs.some((output) => output.alwaysThrows) ||
          (descriptor.set.external && descriptor.set.functions.size === 0);
      }
      if (!descriptor.writable) return true;

      const receiverDescriptor = ownDescriptor(receiver, name);
      if (receiverDescriptor?.kind === 'accessor' ||
          (receiverDescriptor?.kind === 'data' && !receiverDescriptor.writable)) return true;
      if (!receiverDescriptor && ['nonextensible', 'sealed', 'frozen'].includes(
        receiver.integrity ?? 'extensible'
      )) return true;

      if (name === 'length' && receiver.tupleElements) {
        const length = exactNumber(value);
        if (length === undefined) invalidateSequence(receiver, [value]);
        else resizeSequence(receiver, length);
      } else if (/^(?:0|[1-9]\d*)$/.test(name) && receiver.tupleElements) {
        const index = Number(name);
        const lengthDescriptor = ownDescriptor(receiver, 'length');
        if (index >= receiver.tupleElements.length &&
            lengthDescriptor?.kind === 'data' && !lengthDescriptor.writable) return true;
        writeSequencePosition(receiver, index, value);
      } else {
        const prior = receiver.properties.get(name);
        const next = weakHeapUpdateDepth > 0 && prior ? unionValues(prior, value) : value;
        if (receiverDescriptor?.kind === 'data') {
          receiverDescriptor.value = next;
          receiver.properties.set(name, next);
        } else {
          setDataDescriptor(receiver, name, next);
        }
      }
      return false;
    };

    for (const name of names) {
      failed ||= setOne(base, name);
    }
    return failed;
  }

  function deleteAbstractProperty(
    base: AbstractValue,
    keys: AbstractValue
  ): boolean {
    if (keys.external || (keys.strings.size === 0 && keys.numbers.size === 0)) {
      invalidateSequence(base, []);
      return false;
    }
    let failed = false;
    for (const name of [...keys.strings, ...[...keys.numbers].map(String)]) {
      const descriptor = ownDescriptor(base, name);
      if (descriptor && !descriptor.configurable) {
        failed = true;
        continue;
      }
      if (weakHeapUpdateDepth > 0) {
        const prior = base.properties.get(name);
        if (prior) base.properties.set(name, unionValues(prior, valueOf()));
        invalidateSequence(base, []);
        continue;
      }
      base.properties.delete(name);
      base.descriptors.delete(name);
      if (/^(?:0|[1-9]\d*)$/.test(name) && base.tupleElements) {
        base.tupleElements[Number(name)] = valueOf();
        base.elements = base.tupleElements.length > 0
          ? unionValues(...base.tupleElements) : undefined;
      }
    }
    return failed;
  }

  function assignPattern(name: ts.Expression, value: AbstractValue): boolean {
    const target = unwrap(name);
    if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      return assignPattern(target.left, applyBindingDefault(value, target.right, hasAbstractFacts(value)));
    }
    if (ts.isSpreadElement(target)) {
      return assignPattern(target.expression, value);
    }
    if (ts.isIdentifier(target)) {
      assign(target.text, value);
      return false;
    }
    if (ts.isPropertyAccessExpression(target)) {
      const base = resolveValue(target.expression);
      return writeAbstractProperty(base, valueOf({ strings: new Set([target.name.text]) }), value);
    }
    if (ts.isElementAccessExpression(target)) {
      const base = resolveValue(target.expression);
      const keys = resolveValue(target.argumentExpression);
      return writeAbstractProperty(base, keys, value);
    }
    if (ts.isObjectLiteralExpression(target)) {
      const consumed = new Set<string>();
      for (const property of target.properties) {
        if (ts.isPropertyAssignment(property)) {
          const keys = propertyNames(property.name);
          keys.strings.forEach((key) => consumed.add(key));
          const selected = objectPropertyValue(value, keys);
          assignPattern(property.initializer, selected);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          consumed.add(property.name.text);
          const selected = selectedProperty(value, property.name.text);
          assign(property.name.text, applyBindingDefault(
            selected,
            property.objectAssignmentInitializer,
            hasAbstractFacts(selected)
          ));
        } else if (ts.isSpreadAssignment(property)) {
          const properties = new Map([...value.properties]
            .filter(([name]) => !consumed.has(name)));
          assignPattern(property.expression, valueOf({
            properties,
            external: value.external,
            receiverProvenance: value.receiverProvenance,
          }));
        }
      }
      return false;
    }
    if (ts.isArrayLiteralExpression(target)) {
      target.elements.forEach((element, index) => {
        if (ts.isOmittedExpression(element)) return;
        if (ts.isSpreadElement(element)) {
          assignPattern(element.expression, arrayRestValue(value, index));
          return;
        }
        assignPattern(element, arrayElementValue(value, index).value);
      });
    }
    return false;
  }

  function receiverExcluded(expression: ts.Expression): boolean {
    const text = expression.getText(sf);
    return text === 'Buffer' ||
      /\.storage\b/.test(text) || /\.registry\b/.test(text) || /\.query\b/.test(text);
  }

  function withScope<T>(run: () => T): T {
    scopes.push(new Map());
    try { return run(); } finally { scopes.pop(); }
  }

  function valueFingerprint(value: AbstractValue, seen = new Set<AbstractValue>()): string {
    if (seen.has(value)) return '<cycle>';
    seen.add(value);
    const properties = [...value.properties.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, entry]) => `${name}:${valueFingerprint(entry, seen)}`);
    const descriptors = [...value.descriptors.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, descriptor]) => ({
        name, kind: descriptor.kind, writable: descriptor.writable,
        enumerable: descriptor.enumerable, configurable: descriptor.configurable,
        value: descriptor.value ? valueFingerprint(descriptor.value, seen) : null,
        get: descriptor.get ? valueFingerprint(descriptor.get, seen) : null,
        set: descriptor.set ? valueFingerprint(descriptor.set, seen) : null,
      }));
    const result = JSON.stringify({
      strings: [...value.strings].sort(), numbers: [...value.numbers].sort((a, b) => a - b),
      methods: [...value.methods].sort(),
      external: value.external, callable: value.callableCandidate,
      receiverProvenance: value.receiverProvenance ?? null,
      functions: [...value.functions].map((entry) => entry.pos).sort((a, b) => a - b),
      boundArguments: value.boundArguments?.map((entry) => valueFingerprint(entry, seen)) ?? null,
      boundReceiver: value.boundReceiver ? valueFingerprint(value.boundReceiver, seen) : null,
      adapter: value.adapter ?? null,
      adapterConflict: value.adapterConflict,
      adapterCallable: value.adapterCallable
        ? valueFingerprint(value.adapterCallable, seen) : null,
      sequenceBuilder: value.sequenceBuilder ?? null,
      sequenceBuilderConflict: value.sequenceBuilderConflict,
      sequenceSource: value.sequenceSource ? valueFingerprint(value.sequenceSource, seen) : null,
      sequenceMutation: value.sequenceMutation ?? null,
      sequenceMutationConflict: value.sequenceMutationConflict,
      sequenceMutationTarget: value.sequenceMutationTarget
        ? valueFingerprint(value.sequenceMutationTarget, seen) : null,
      sequenceAliases: value.sequenceAliases
        ? [...value.sequenceAliases].map((entry) => valueFingerprint(entry, seen)).sort() : null,
      properties, elements: value.elements ? valueFingerprint(value.elements, seen) : null,
      descriptors,
      prototype: value.prototype ? valueFingerprint(value.prototype, seen) : null,
      exactShape: value.exactShape,
      tupleElements: value.tupleElements?.map((entry) => valueFingerprint(entry, seen)) ?? null,
      primitives: [...value.primitives].sort(),
      integrity: value.integrity ?? null,
      alwaysThrows: value.alwaysThrows,
    });
    seen.delete(value);
    return result;
  }

  function isDatabaseCallable(
    value: AbstractValue,
    seen = new Set<AbstractValue>()
  ): boolean {
    if (seen.has(value)) return false;
    seen.add(value);
    if (value.methods.size > 0) return true;
    if (value.adapterCallable && isDatabaseCallable(value.adapterCallable, seen)) return true;
    // A callback which happens to contain an ordinary database call is still
    // traversed below. Only a database callable value itself crossing an opaque
    // HOF boundary is unresolved (for example externalHof(client.from)).
    return false;
  }

  function hasExecutableProvenance(
    value: AbstractValue,
    seen = new Set<AbstractValue>()
  ): boolean {
    if (seen.has(value)) return false;
    seen.add(value);
    if (value.methods.size > 0 || value.callableCandidate || value.adapter ||
        value.sequenceBuilder || value.sequenceMutation || value.functions.size > 0) return true;
    if (value.adapterCallable && hasExecutableProvenance(value.adapterCallable, seen)) return true;
    if (value.sequenceSource && hasExecutableProvenance(value.sequenceSource, seen)) return true;
    if (value.sequenceMutationTarget &&
        hasExecutableProvenance(value.sequenceMutationTarget, seen)) return true;
    if (value.elements && hasExecutableProvenance(value.elements, seen)) return true;
    if (value.tupleElements?.some((entry) => hasExecutableProvenance(entry, seen))) return true;
    return [...value.properties.values()].some((entry) => hasExecutableProvenance(entry, seen));
  }

  function isIdentityFunction(target: ts.FunctionLikeDeclaration): boolean {
    const first = target.parameters[0];
    if (!first || !ts.isIdentifier(first.name) || !target.body) return false;
    if (ts.isArrowFunction(target) && !ts.isBlock(target.body)) {
      const body = unwrap(target.body);
      return ts.isIdentifier(body) && body.text === first.name.text;
    }
    if (!ts.isBlock(target.body)) return false;
    const executable = target.body.statements.filter((statement) => !ts.isEmptyStatement(statement));
    if (executable.length !== 1 || !ts.isReturnStatement(executable[0]) ||
        !executable[0].expression) return false;
    const returned = unwrap(executable[0].expression);
    return ts.isIdentifier(returned) && returned.text === first.name.text;
  }

  function invocationArgumentValues(args: ts.NodeArray<ts.Expression>): AbstractValue[] {
    return args.flatMap((argument) => {
      if (!ts.isSpreadElement(argument)) return [resolveValue(argument)];
      const spread = resolveValue(argument.expression);
      return spread.tupleElements ?? [unionValues(
        spread.elements ?? valueOf(),
        valueOf({ external: spread.external || !spread.elements })
      )];
    });
  }

  function appliedArguments(value: AbstractValue): AbstractValue[] {
    return value.tupleElements ?? [unionValues(
      value.elements ?? valueOf(),
      valueOf({ external: value.external || !value.elements })
    )];
  }

  function boundCallable(
    callable: AbstractValue,
    args: AbstractValue[],
    receiver?: AbstractValue
  ): AbstractValue {
    return valueOf({
      strings: callable.strings,
      methods: callable.methods,
      properties: callable.properties,
      descriptors: callable.descriptors,
      prototype: callable.prototype,
      exactShape: callable.exactShape,
      elements: callable.elements,
      tupleElements: callable.tupleElements,
      external: callable.external,
      callableCandidate: callable.callableCandidate,
      functions: callable.functions,
      boundArguments: [...(callable.boundArguments ?? []), ...args],
      boundReceiver: callable.boundReceiver ?? receiver,
      adapter: callable.adapter,
      adapterCallable: callable.adapterCallable,
      adapterConflict: callable.adapterConflict,
      receiverProvenance: callable.receiverProvenance,
      sequenceBuilder: callable.sequenceBuilder,
      sequenceBuilderConflict: callable.sequenceBuilderConflict,
      sequenceSource: callable.sequenceSource,
      sequenceMutation: callable.sequenceMutation,
      sequenceMutationConflict: callable.sequenceMutationConflict,
      sequenceMutationTarget: callable.sequenceMutationTarget,
      sequenceAliases: callable.sequenceAliases,
      primitives: callable.primitives,
      integrity: callable.integrity,
      alwaysThrows: callable.alwaysThrows,
    });
  }

  interface InvocationContext {
    record: boolean;
    node: ts.CallExpression;
    expression: string;
    targetExpression?: string;
  }

  let callableEvaluationWork = 0;
  const sequenceMutationResults = new WeakMap<ts.CallExpression, {
    target: AbstractValue;
    result: AbstractValue;
    postState: string;
  }>();

  function refreshSequence(target: AbstractValue, entries: AbstractValue[]): void {
    const properties = new Map([...target.properties].filter(([name]) =>
      name !== 'length' && !/^(?:0|[1-9]\d*)$/.test(name)
    ));
    entries.forEach((entry, index) => properties.set(String(index), entry));
    properties.set('length', valueOf({ numbers: new Set([entries.length]) }));
    target.properties = properties;
    target.descriptors = new Map([...target.descriptors].filter(([name]) =>
      name !== 'length' && !/^(?:0|[1-9]\d*)$/.test(name)
    ));
    entries.forEach((entry, index) => setDataDescriptor(target, String(index), entry));
    setDataDescriptor(target, 'length', properties.get('length')!, {
      writable: true, enumerable: false, configurable: false,
    });
    target.tupleElements = Array.from({ length: entries.length }, (_, index) =>
      index in entries ? entries[index] : valueOf());
    const present = entries.filter((_, index) => index in entries);
    target.elements = present.length > 0 ? unionValues(...present) : undefined;
  }

  function invalidateSequence(target: AbstractValue, args: AbstractValue[]): void {
    const candidates = [
      ...(target.tupleElements ?? []),
      ...(target.elements ? [target.elements] : []),
      ...args,
    ];
    const executable = candidates.some((entry) => hasExecutableProvenance(entry));
    target.properties = new Map([...target.properties].filter(([name]) =>
      name !== 'length' && !/^(?:0|[1-9]\d*)$/.test(name)
    ));
    target.descriptors = new Map([...target.descriptors].filter(([name]) =>
      name !== 'length' && !/^(?:0|[1-9]\d*)$/.test(name)
    ));
    target.tupleElements = undefined;
    const uncertainty = valueOf({ external: true, callableCandidate: executable });
    target.elements = candidates.length > 0
      ? unionValues(...candidates, uncertainty) : uncertainty;
    target.external = true;
    target.exactShape = false;
    target.callableCandidate ||= executable;
  }

  function exactNumber(value: AbstractValue | undefined): number | undefined {
    if (!value || value.external || value.numbers.size !== 1 || value.strings.size > 0 ||
        value.methods.size > 0 || value.functions.size > 0) return undefined;
    const number = [...value.numbers][0];
    return Number.isFinite(number) ? number : undefined;
  }

  function relativeIndex(value: number, length: number): number {
    const integer = Math.trunc(value);
    return integer < 0 ? Math.max(length + integer, 0) : Math.min(integer, length);
  }

  function evaluateSequenceMutation(
    callable: AbstractValue,
    args: AbstractValue[],
    receiver: AbstractValue | undefined,
    context: InvocationContext
  ): AbstractValue {
    const target = callable.sequenceMutationTarget ?? receiver ?? valueOf({
      external: true, callableCandidate: true,
    });
    if (!callable.sequenceMutationTarget && functionStack.length > 0 && target.tupleElements) {
      invalidateSequence(target, args);
      return target;
    }
    if ((target.sequenceAliases?.size ?? 0) > 1 || weakHeapUpdateDepth > 0) {
      const aliases = target.sequenceAliases ?? new Set([target]);
      aliases.forEach((alias) => invalidateSequence(alias, args));
      invalidateSequence(target, args);
      return target;
    }
    const cached = sequenceMutationResults.get(context.node);
    if (cached?.target === target && cached.postState === valueFingerprint(target)) {
      return cached.result;
    }
    const method = callable.sequenceMutation!;
    const entries = target.tupleElements ? [...target.tupleElements] : undefined;
    let result: AbstractValue;

    if (!entries || target.external) {
      invalidateSequence(target, args);
      result = method === 'push' || method === 'unshift'
        ? valueOf({ external: true }) : target;
      sequenceMutationResults.set(context.node, {
        target, result, postState: valueFingerprint(target),
      });
      return result;
    }

    {
      for (let index = 0; index < entries.length; index += 1) {
        if (!target.properties.has(String(index))) delete entries[index];
      }
      const numberArgument = (index: number, fallback?: number): number | undefined =>
        index >= args.length ? fallback : exactNumber(args[index]);
      let nativeArguments: unknown[] | undefined;
      if (method === 'push' || method === 'unshift') nativeArguments = args;
      else if (method === 'pop' || method === 'shift' || method === 'reverse' ||
          (method === 'sort' && args.length === 0)) nativeArguments = [];
      else if (method === 'splice') {
        const start = numberArgument(0);
        const count = numberArgument(1);
        nativeArguments = args.length === 0 ? []
          : start === undefined || (args.length > 1 && count === undefined) ? undefined
            : args.length === 1 ? [start] : [start, count!, ...args.slice(2)];
      } else if (method === 'fill') {
        const start = numberArgument(1, 0);
        const end = numberArgument(2, entries.length);
        nativeArguments = start === undefined || end === undefined
          ? undefined : [args[0] ?? valueOf(), start, end];
      } else if (method === 'copyWithin') {
        const destination = numberArgument(0);
        const start = numberArgument(1);
        const end = numberArgument(2, entries.length);
        nativeArguments = destination === undefined || start === undefined || end === undefined
          ? undefined : [destination, start, end];
      } else {
        nativeArguments = undefined;
      }
      if (!nativeArguments) {
        invalidateSequence(target, args);
        result = target;
      } else {
        const shadow: AbstractValue[] = [];
        const accessorDescriptors = new Map<string, AbstractPropertyDescriptor>();
        for (let index = 0; index < entries.length; index += 1) {
          const name = String(index);
          const descriptor = ownDescriptor(target, name);
          if (!descriptor) continue;
          if (descriptor.kind === 'data') {
            Object.defineProperty(shadow, name, {
              value: descriptor.value ?? valueOf(), writable: descriptor.writable,
              enumerable: descriptor.enumerable, configurable: descriptor.configurable,
            });
          } else {
            accessorDescriptors.set(name, descriptor);
            Object.defineProperty(shadow, name, {
              get: descriptor.get ? () => {
                const output = readAbstractProperty(target, name, target) ?? valueOf();
                if (output.alwaysThrows) throw new TypeError('abstract getter threw');
                return output;
              } : undefined,
              set: descriptor.set ? (next: AbstractValue) => {
                const outputs = [...descriptor.set!.functions]
                  .map((setter) => invokeFunction(setter, [next], target));
                if (outputs.some((output) => output.alwaysThrows)) {
                  throw new TypeError('abstract setter threw');
                }
              } : undefined,
              enumerable: descriptor.enumerable, configurable: descriptor.configurable,
            });
          }
        }
        const targetLength = ownDescriptor(target, 'length');
        Object.defineProperty(shadow, 'length', {
          value: entries.length,
          writable: targetLength?.kind === 'data' ? targetLength.writable : true,
          enumerable: false,
          configurable: false,
        });
        if (target.integrity === 'frozen') Object.freeze(shadow);
        else if (target.integrity === 'sealed') Object.seal(shadow);
        else if (target.integrity === 'nonextensible') Object.preventExtensions(shadow);
        let nativeResult: unknown;
        let threw = false;
        try {
          nativeResult = (Array.prototype[method] as (...values: unknown[]) => unknown)
            .apply(shadow, nativeArguments);
        } catch {
          threw = true;
          nativeResult = undefined;
        }

        for (const name of [...target.descriptors.keys()]) {
          if (/^(?:0|[1-9]\d*)$/.test(name)) {
            target.descriptors.delete(name);
            target.properties.delete(name);
          }
        }
        for (const name of Object.getOwnPropertyNames(shadow)) {
          if (!/^(?:0|[1-9]\d*)$/.test(name)) continue;
          const descriptor = Object.getOwnPropertyDescriptor(shadow, name)!;
          const accessor = accessorDescriptors.get(name);
          if (accessor && !('value' in descriptor)) {
            target.descriptors.set(name, accessor);
            target.properties.delete(name);
          } else {
            const abstractValue = descriptor.value as AbstractValue;
            setDataDescriptor(target, name, abstractValue, {
              writable: Boolean(descriptor.writable),
              enumerable: Boolean(descriptor.enumerable),
              configurable: Boolean(descriptor.configurable),
            });
          }
        }
        const shadowLength = Object.getOwnPropertyDescriptor(shadow, 'length')!;
        const lengthValue = valueOf({ numbers: new Set([shadow.length]) });
        setDataDescriptor(target, 'length', lengthValue, {
          writable: Boolean(shadowLength.writable), enumerable: false, configurable: false,
        });
        target.tupleElements = Array.from({ length: shadow.length }, (_, index) => {
          const descriptor = ownDescriptor(target, String(index));
          return descriptor?.kind === 'data' ? descriptor.value ?? valueOf() : valueOf();
        });
        const present = descriptorNames(target).filter((name) =>
          /^(?:0|[1-9]\d*)$/.test(name)
        ).map((name) => readAbstractProperty(target, name, target) ?? valueOf());
        target.elements = present.length > 0 ? unionValues(...present) : undefined;
        if (threw) {
          result = valueOf({ alwaysThrows: true });
        } else if (method === 'push' || method === 'unshift') {
          result = typeof nativeResult === 'number'
            ? valueOf({ numbers: new Set([nativeResult]) }) : valueOf();
        } else if (method === 'pop' || method === 'shift') {
          result = nativeResult && typeof nativeResult === 'object'
            ? nativeResult as AbstractValue : valueOf({ primitives: new Set(['undefined']) });
        } else if (method === 'splice') {
          result = Array.isArray(nativeResult)
            ? coherentSequence(nativeResult as AbstractValue[]) : valueOf();
        } else {
          result = target;
        }
      }
    }
    sequenceMutationResults.set(context.node, {
      target, result, postState: valueFingerprint(target),
    });
    return result;
  }

  function adapterStateKey(
    callable: AbstractValue,
    args: AbstractValue[],
    receiver: AbstractValue | undefined
  ): string {
    return JSON.stringify({
      adapter: callable.adapter,
      callable: valueFingerprint(callable),
      target: callable.adapterCallable ? valueFingerprint(callable.adapterCallable) : null,
      receiver: receiver ? valueFingerprint(receiver) : null,
      arguments: args.map((argument) => valueFingerprint(argument)),
    });
  }

  function evaluateCallable(
    initialCallable: AbstractValue,
    initialArguments: AbstractValue[],
    receiver: AbstractValue | undefined,
    context: InvocationContext,
    adapterPath = new Set<string>(),
    depth = 0
  ): AbstractValue {
    if (initialCallable.adapter) callableEvaluationWork += 1;
    const invocationArguments = initialCallable.boundArguments
      ? [...initialCallable.boundArguments, ...initialArguments]
      : initialArguments;
    const invocationReceiver = initialCallable.boundReceiver ?? receiver;
    const stateKey = initialCallable.adapter
      ? adapterStateKey(initialCallable, invocationArguments, invocationReceiver)
      : undefined;
    if (depth > 64 || callableEvaluationWork > 4096 ||
        (stateKey !== undefined && adapterPath.has(stateKey))) {
      if (context.record) {
        calls.push({
          method: 'unknown', unsupported: 'dynamic callable name',
          expression: 'non-convergent Function adapter', position: context.node.pos,
        });
      }
      return valueOf({ external: true, callableCandidate: true });
    }

    let callable = initialCallable;
    let args = invocationArguments;
    const effectiveReceiver = invocationReceiver;
    if (callable.adapter) {
      const nextPath = new Set(adapterPath);
      if (stateKey !== undefined) nextPath.add(stateKey);
      if (callable.adapter === 'reflectApply') {
        return evaluateCallable(
          args[0] ?? valueOf({ external: true, callableCandidate: true }),
          appliedArguments(args[2] ?? valueOf({ external: true })),
          args[1], context, nextPath, depth + 1
        );
      }

      const target = callable.adapterCallable ?? effectiveReceiver ??
        valueOf({ external: true, callableCandidate: true });
      if (callable.adapter === 'bind') {
        return boundCallable(target, args.slice(1), args[0]);
      }
      if (callable.adapter === 'call') {
        return evaluateCallable(
          target, args.slice(1), args[0], context, nextPath, depth + 1
        );
      }
      return evaluateCallable(
        target,
        appliedArguments(args[1] ?? valueOf({ external: true })),
        args[0], context, nextPath, depth + 1
      );
    }

    if (callable.sequenceMutation) {
      return evaluateSequenceMutation(callable, args, effectiveReceiver, context);
    }

    if (callable.sequenceBuilder) {
      if (callable.sequenceBuilder === 'constructor') {
        const length = args.length === 1 && !args[0].external &&
          args[0].numbers.size === 1 && args[0].strings.size === 0 &&
          args[0].methods.size === 0 && args[0].functions.size === 0
          ? [...args[0].numbers][0] : undefined;
        if (length !== undefined && Number.isInteger(length) && length >= 0 && length <= 4096) {
          return coherentSequence(Array.from({ length }, () => valueOf()));
        }
        return coherentSequence(args);
      }
      if (callable.sequenceBuilder === 'of') return coherentSequence(args);
      if (callable.sequenceBuilder === 'concat') {
        const source = callable.sequenceSource ?? valueOf({ external: true });
        const entries = [...(source.tupleElements ?? [])];
        let external = source.external || !source.tupleElements;
        let uncertain = source.elements;
        for (const argument of args) {
          if (argument.tupleElements) entries.push(...argument.tupleElements);
          else {
            entries.push(argument);
            external ||= argument.external;
            uncertain = uncertain ? unionValues(uncertain, argument) : argument;
          }
        }
        return coherentSequence(entries, external, uncertain);
      }

      const source = args[0] ?? valueOf({ external: true });
      const mapper = args[1];
      if (!source.tupleElements) {
        return valueOf({
          elements: unionValues(source.elements ?? valueOf(), valueOf({
            external: true,
            callableCandidate: source.external ||
              Boolean(source.elements && isDatabaseCallable(source.elements)),
          })),
          external: true,
          callableCandidate: true,
        });
      }
      if (!mapper) return coherentSequence(source.tupleElements, source.external, source.elements);
      if (mapper.external || (mapper.functions.size === 0 && mapper.methods.size === 0)) {
        return valueOf({
          elements: unionValues(...source.tupleElements, valueOf({
            external: true,
            callableCandidate: source.tupleElements.some((entry) => isDatabaseCallable(entry)),
          })),
          external: true,
          callableCandidate: true,
        });
      }
      if (!source.tupleElements.some((entry) => isDatabaseCallable(entry))) {
        return coherentSequence(source.tupleElements, source.external, source.elements);
      }
      if (mapper.functions.size > 0 && [...mapper.functions].every(isIdentityFunction)) {
        return coherentSequence(source.tupleElements, source.external, source.elements);
      }
      return valueOf({
        elements: unionValues(...source.tupleElements, valueOf({
          external: true,
          callableCandidate: true,
        })),
        external: true,
        callableCandidate: true,
      });
    }

    if (context.record && callable.methods.size > 0) {
      const targetValue = args[0] ?? valueOf({ external: true });
      for (const method of callable.methods) {
        if (targetValue.external || targetValue.strings.size === 0) {
          calls.push({
            method, unsupported: 'dynamic target',
            expression: context.targetExpression ?? context.expression,
            position: context.node.pos,
          });
        } else if (targetValue.strings.size === 1) {
          calls.push({ method, target: [...targetValue.strings][0], position: context.node.pos });
        } else {
          calls.push({
            method, targets: [...targetValue.strings].sort(),
            expression: context.targetExpression ?? context.expression,
            dynamicKind: 'target',
            dynamicValues: [...targetValue.strings].sort(), position: context.node.pos,
          });
        }
      }
    }

    const outputs = [...callable.functions].map((target) =>
      invokeFunction(target, parameterValues(target, args), effectiveReceiver)
    );
    if (context.record && callable.external &&
        (callable.callableCandidate || args[0]?.strings.has('contract_hours_ledger') ||
         args.some((argument) => isDatabaseCallable(argument)) ||
         (effectiveReceiver && isDatabaseCallable(effectiveReceiver)))) {
      calls.push({
        method: 'unknown', unsupported: 'dynamic callable name',
        expression: context.expression, position: context.node.pos,
      });
    }
    if (outputs.length > 0) return unionValues(...outputs);
    if (callable.methods.size > 0) {
      return valueOf({ receiverProvenance: 'database' });
    }
    return valueOf({
      external: callable.external,
      callableCandidate: callable.callableCandidate && callable.external,
      receiverProvenance: callable.receiverProvenance,
    });
  }

  function callArguments(
    target: ts.FunctionLikeDeclaration,
    args: ts.NodeArray<ts.Expression>
  ): AbstractValue[] {
    const expanded: AbstractValue[] = [];
    for (const argument of args) {
      if (!ts.isSpreadElement(argument)) {
        expanded.push(resolveValue(argument));
        continue;
      }
      const spread = resolveValue(argument.expression);
      expanded.push(...(spread.tupleElements ?? [unionValues(
          spread.elements ?? valueOf(),
          valueOf({ external: spread.external || !spread.elements })
        )]));
    }
    return target.parameters.map((parameter, index) => {
      if (parameter.dotDotDotToken) {
        return valueOf({
          elements: unionValues(...expanded.slice(index)),
          tupleElements: expanded.slice(index),
          external: expanded.slice(index).some((entry) => entry.external),
        });
      }
      return expanded[index] ?? (parameter.initializer
        ? resolveValue(parameter.initializer) : valueOf());
    });
  }

  function parameterValues(
    target: ts.FunctionLikeDeclaration,
    expanded: AbstractValue[]
  ): AbstractValue[] {
    return target.parameters.map((parameter, index) => {
      if (parameter.dotDotDotToken) {
        return valueOf({
          elements: unionValues(...expanded.slice(index)),
          tupleElements: expanded.slice(index),
          external: expanded.slice(index).some((entry) => entry.external),
        });
      }
      return expanded[index] ?? (parameter.initializer
        ? resolveValue(parameter.initializer) : valueOf());
    });
  }

  function mergeFunctionInputs(
    target: ts.FunctionLikeDeclaration,
    values: AbstractValue[]
  ): boolean {
    const prior = functionInputs.get(target) ?? [];
    const merged = target.parameters.map((_, index) => {
      const previous = prior[index];
      const incoming = values[index] ?? valueOf();
      if (!previous || !hasAbstractFacts(previous)) return incoming;
      if (!hasAbstractFacts(incoming)) return previous;
      return unionValues(previous, incoming);
    });
    const changed = merged.some((entry, index) =>
      valueFingerprint(entry) !== valueFingerprint(prior[index] ?? valueOf())
    );
    if (changed || !functionInputs.has(target)) functionInputs.set(target, merged);
    return changed;
  }

  function invokeFunction(
    target: ts.FunctionLikeDeclaration,
    values: AbstractValue[],
    receiver?: AbstractValue
  ): AbstractValue {
    mergeFunctionInputs(target, values);
    if (activeFunctions.has(target)) {
      return functionOutputs.get(target) ?? valueOf({
        external: true,
        callableCandidate: true,
      });
    }
    let iterations = 0;
    let before: string;
    let abrupt: Completion | undefined;
    do {
      before = (functionInputs.get(target) ?? []).map((entry) => valueFingerprint(entry)).join('|');
      abrupt = withScope(() => {
        for (const [name, value] of functionClosures.get(target) ?? []) {
          scopes[scopes.length - 1].set(name, value);
        }
        const inputs = functionInputs.get(target) ?? [];
        target.parameters.forEach((parameter, index) =>
          declareName(parameter.name, parameter.initializer, inputs[index])
        );
        activeFunctions.add(target);
        functionStack.push(target);
        receiverStack.push(receiver ?? valueOf({ external: true }));
        try {
          if (target.body && ts.isArrowFunction(target) && !ts.isBlock(target.body)) {
            const output = resolveValue(target.body);
            functionOutputs.set(target, functionOutputs.has(target)
              ? unionValues(functionOutputs.get(target)!, output)
              : output);
            return visit(target.body);
          } else if (target.body) {
            return visit(target.body);
          }
          return undefined;
        } finally {
          receiverStack.pop();
          functionStack.pop();
          activeFunctions.delete(target);
        }
      });
      iterations += 1;
      if (iterations > 32) {
        const executable = [...(functionInputs.get(target) ?? []),
          ...(functionOutputs.has(target) ? [functionOutputs.get(target)!] : [])]
          .some((entry) => hasExecutableProvenance(entry));
        if (executable) {
          calls.push({
            method: 'unknown', unsupported: 'dynamic callable name',
            expression: 'non-convergent recursive callable', position: target.pos,
          });
        }
        break;
      }
      if (abrupt?.kind === 'throw') break;
    } while (before !== (functionInputs.get(target) ?? [])
      .map((entry) => valueFingerprint(entry)).join('|'));
    if (abrupt?.kind === 'throw') return valueOf({ alwaysThrows: true });
    return functionOutputs.get(target) ?? valueOf();
  }

  function visitStatements(statements: ts.NodeArray<ts.Statement>): Completion | undefined {
    for (const statement of statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        scopes[scopes.length - 1].set(statement.name.text, valueOf({
          functions: new Set([statement]), callableCandidate: true,
        }));
      } else if (ts.isClassDeclaration(statement) && statement.name) {
        scopes[scopes.length - 1].set(statement.name.text, classValue(statement));
      }
    }
    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      const completion = visit(statement);
      if (completion && completion.kind !== 'normal') {
        for (const remaining of statements.slice(index + 1)) {
          if (ts.isFunctionDeclaration(remaining) && remaining.name) {
            invokeFunction(remaining, remaining.parameters.map(() => valueOf()));
            functionInputs.delete(remaining);
            functionOutputs.delete(remaining);
          }
        }
        return completion;
      }
    }
    return undefined;
  }

  function visit(node: ts.Node): Completion | undefined {
    if (ts.isSourceFile(node)) {
      return visitStatements(node.statements);
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause) return;
      const moduleName = node.moduleSpecifier.text;
      const scope = scopes[scopes.length - 1];
      let throws = false;
      if (clause.name) {
        const imported = importedValue(moduleName, 'default');
        scope.set(clause.name.text, imported);
        throws ||= imported.alwaysThrows;
      }
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          const imported = importedValue(moduleName, '*');
          scope.set(clause.namedBindings.name.text, imported);
          throws ||= imported.alwaysThrows;
        } else {
          for (const specifier of clause.namedBindings.elements) {
            const imported = importedValue(
              moduleName,
              specifier.propertyName?.text ?? specifier.name.text
            );
            scope.set(specifier.name.text, imported);
            throws ||= imported.alwaysThrows;
          }
        }
      }
      if (throws) return { kind: 'throw', value: valueOf({ alwaysThrows: true }) };
      return;
    }
    if (ts.isBlock(node) && node !== sf) {
      return withScope(() => visitStatements(node.statements));
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      scopes[scopes.length - 1].set(node.name.text, valueOf({
        functions: new Set([node]), callableCandidate: true,
      }));
      invokeFunction(node, node.parameters.map(() => valueOf()));
      functionInputs.delete(node);
      functionOutputs.delete(node);
      return;
    }
    if (ts.isClassDeclaration(node) && node.name) {
      scopes[scopes.length - 1].set(node.name.text, classValue(node));
      return;
    }
    if (ts.isFunctionLike(node)) {
      invokeFunction(node, node.parameters.map(() => valueOf()));
      functionInputs.delete(node);
      functionOutputs.delete(node);
      return;
    }
    if (ts.isReturnStatement(node)) {
      const output = node.expression
        ? resolveValue(node.expression) : valueOf({ primitives: new Set(['undefined']) });
      const target = functionStack.at(-1);
      if (target) {
        functionOutputs.set(target, functionOutputs.has(target)
          ? unionValues(functionOutputs.get(target)!, output)
          : output);
        if (node.expression) {
          const expressionCompletion = visit(node.expression);
          if (expressionCompletion?.kind === 'throw') return expressionCompletion;
        }
      }
      return { kind: 'return', value: output };
    }
    if (ts.isThrowStatement(node)) {
      if (node.expression) visit(node.expression);
      return { kind: 'throw', value: resolveValue(node.expression) };
    }
    if (ts.isBreakStatement(node)) {
      return { kind: 'break', label: node.label?.text };
    }
    if (ts.isContinueStatement(node)) {
      return { kind: 'continue', label: node.label?.text };
    }
    if (ts.isTryStatement(node)) {
      let completion = visit(node.tryBlock);
      if (completion?.kind === 'throw' && node.catchClause) {
        completion = withScope(() => {
          if (node.catchClause?.variableDeclaration) {
            declareName(node.catchClause.variableDeclaration.name, undefined,
              completion?.value ?? valueOf({ external: true }));
          }
          return visit(node.catchClause!.block);
        });
      }
      if (node.finallyBlock) {
        const finalCompletion = visit(node.finallyBlock);
        if (finalCompletion && finalCompletion.kind !== 'normal') return finalCompletion;
      }
      return completion;
    }
    if (ts.isIfStatement(node)) {
      visit(node.expression);
      const condition = abstractTruthiness(resolveValue(node.expression));
      if (condition === 'truthy') {
        return visit(node.thenStatement);
      }
      if (condition === 'falsy') {
        return node.elseStatement ? visit(node.elseStatement) : undefined;
      }
      const before = scopes.map((scope) => new Map(scope));
      const runBranch = (branch: ts.Statement | undefined): {
        scopes: Array<Map<string, AbstractValue>>;
        completion?: Completion;
      } => {
        scopes.splice(0, scopes.length, ...before.map((scope) => new Map(scope)));
        let completion: Completion | undefined;
        if (branch) {
          weakHeapUpdateDepth += 1;
          try { completion = visit(branch); } finally { weakHeapUpdateDepth -= 1; }
        }
        return { scopes: scopes.map((scope) => new Map(scope)), completion };
      };
      const whenTrue = runBranch(node.thenStatement);
      const whenFalse = runBranch(node.elseStatement);
      scopes.splice(0, scopes.length, ...before.map((scope, index) => {
        const merged = new Map<string, AbstractValue>();
        const names = new Set([
          ...scope.keys(), ...whenTrue.scopes[index].keys(), ...whenFalse.scopes[index].keys(),
        ]);
        for (const name of names) {
          const values = [whenTrue.scopes[index].get(name), whenFalse.scopes[index].get(name)]
            .filter((value): value is AbstractValue => Boolean(value));
          merged.set(name, values.length > 1 ? unionValues(...values) : values[0] ?? valueOf());
        }
        return merged;
      }));
      return whenTrue.completion?.kind === whenFalse.completion?.kind
        ? whenTrue.completion : undefined;
    }
    if (ts.isSwitchStatement(node)) {
      const expressionCompletion = visit(node.expression);
      if (expressionCompletion?.kind === 'throw') return expressionCompletion;
      const discriminant = resolveValue(node.expression);
      const scalarKeys = [
        ...[...discriminant.strings].map((value) => `string:${value}`),
        ...[...discriminant.numbers].map((value) => `number:${value}`),
        ...[...discriminant.primitives].map((value) => `primitive:${value}`),
      ];
      const exactDiscriminant = !discriminant.external && scalarKeys.length === 1
        ? scalarKeys[0] : undefined;
      let defaultIndex: number | undefined;
      let selectedIndex: number | undefined;
      let uncertain = exactDiscriminant === undefined;
      for (let index = 0; index < node.caseBlock.clauses.length; index += 1) {
        const clause = node.caseBlock.clauses[index];
        if (ts.isDefaultClause(clause)) {
          defaultIndex = index;
          continue;
        }
        const caseCompletion = visit(clause.expression);
        if (caseCompletion?.kind === 'throw') return caseCompletion;
        const candidate = resolveValue(clause.expression);
        const candidateKeys = [
          ...[...candidate.strings].map((value) => `string:${value}`),
          ...[...candidate.numbers].map((value) => `number:${value}`),
          ...[...candidate.primitives].map((value) => `primitive:${value}`),
        ];
        if (candidate.external || candidateKeys.length !== 1) uncertain = true;
        if (exactDiscriminant !== undefined && candidateKeys.length === 1 &&
            candidateKeys[0] === exactDiscriminant) {
          selectedIndex = index;
          break;
        }
      }
      if (!uncertain) selectedIndex ??= defaultIndex;
      if (selectedIndex !== undefined) {
        for (const clause of node.caseBlock.clauses.slice(selectedIndex)) {
          const completion = withScope(() => visitStatements(clause.statements));
          if (completion?.kind === 'break' && !completion.label) return;
          if (completion && completion.kind !== 'normal') return completion;
        }
        return;
      }
      if (!uncertain) return;

      const callStart = calls.length;
      weakHeapUpdateDepth += 1;
      try {
        for (const clause of node.caseBlock.clauses) {
          const completion = withScope(() => visitStatements(clause.statements));
          if (completion?.kind === 'return' || completion?.kind === 'throw') break;
        }
      } finally {
        weakHeapUpdateDepth -= 1;
      }
      const branchCalls = calls.splice(callStart);
      const executableBranchCalls = branchCalls.filter((call) =>
        (call.method === 'from' || call.method === 'rpc') &&
        (call.unsupported !== undefined || call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger') || call.target === undefined)
      );
      calls.push(...branchCalls.filter((call) => !executableBranchCalls.includes(call)));
      if (executableBranchCalls.length > 0) {
        calls.push({
          method: 'unknown', unsupported: 'dynamic callable name',
          expression: node.expression.getText(sf), position: node.pos,
        });
      }
      return;
    }
    if (ts.isLabeledStatement(node)) {
      const completion = visit(node.statement);
      return completion?.kind === 'break' && completion.label === node.label.text
        ? undefined : completion;
    }
    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      if (ts.isWhileStatement(node)) {
        const conditionCompletion = visit(node.expression);
        if (conditionCompletion?.kind === 'throw') return conditionCompletion;
        if (abstractTruthiness(resolveValue(node.expression)) === 'falsy') return;
      }
      const completion = visit(node.statement);
      if (completion?.kind === 'return' || completion?.kind === 'throw') return completion;
      if (ts.isDoStatement(node)) {
        const conditionCompletion = visit(node.expression);
        if (conditionCompletion?.kind === 'throw') return conditionCompletion;
      }
      return;
    }
    if (ts.isForStatement(node)) {
      if (node.initializer) {
        const initializerCompletion = visit(node.initializer);
        if (initializerCompletion?.kind === 'throw') return initializerCompletion;
      }
      if (node.condition) {
        const conditionCompletion = visit(node.condition);
        if (conditionCompletion?.kind === 'throw') return conditionCompletion;
        if (abstractTruthiness(resolveValue(node.condition)) === 'falsy') return;
      }
      const completion = visit(node.statement);
      if (completion?.kind === 'return' || completion?.kind === 'throw') return completion;
      if (node.incrementor) {
        const incrementCompletion = visit(node.incrementor);
        if (incrementCompletion?.kind === 'throw') return incrementCompletion;
      }
      return;
    }
    if (ts.isForOfStatement(node)) {
      visit(node.expression);
      const iterable = resolveValue(node.expression);
      const completion = withScope(() => {
        if (ts.isVariableDeclarationList(node.initializer)) {
          for (const declaration of node.initializer.declarations) {
            declareName(
              declaration.name,
              undefined,
              unionValues(
                iterable.elements ?? valueOf(),
                valueOf({ external: iterable.external })
              )
            );
          }
        } else if (ts.isIdentifier(node.initializer)) {
          assign(node.initializer.text, iterable.elements ?? valueOf({ external: true }));
        }
        return visit(node.statement);
      });
      return completion?.kind === 'return' || completion?.kind === 'throw'
        ? completion : undefined;
    }
    if (ts.isVariableDeclaration(node)) {
      if (!node.name) return;
      if (node.initializer) {
        const completion = visit(node.initializer);
        if (completion?.kind === 'throw') return completion;
      }
      declareName(node.name, node.initializer);
      return;
    }
    if (ts.isBinaryExpression(node) && [
      ts.SyntaxKind.AmpersandAmpersandEqualsToken,
      ts.SyntaxKind.BarBarEqualsToken,
      ts.SyntaxKind.QuestionQuestionEqualsToken,
    ].includes(node.operatorToken.kind)) {
      const prior = resolveValue(node.left);
      const decision = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
        ? abstractTruthiness(prior)
        : node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken
          ? abstractTruthiness(prior) === 'truthy' ? 'skip'
            : abstractTruthiness(prior) === 'falsy' ? 'write' : 'unknown'
          : abstractNullishness(prior) === 'nullish' ? 'write'
            : abstractNullishness(prior) === 'non-nullish' ? 'skip' : 'unknown';
      const write = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
        ? decision === 'truthy' : decision === 'write';
      const skip = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken
        ? decision === 'falsy' : decision === 'skip';
      if (write) {
        const rightCompletion = visit(node.right);
        if (rightCompletion?.kind === 'throw') return rightCompletion;
        if (assignPattern(node.left, resolveValue(node.right)) && strictMode()) {
          return { kind: 'throw', value: valueOf({ alwaysThrows: true }) };
        }
      } else if (!skip) {
        visit(node.right);
        weakHeapUpdateDepth += 1;
        try { assignPattern(node.left, resolveValue(node.right)); }
        finally { weakHeapUpdateDepth -= 1; }
      }
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >=
        ts.SyntaxKind.FirstCompoundAssignment && node.operatorToken.kind <=
        ts.SyntaxKind.LastCompoundAssignment) {
      visit(node.right);
      if (assignPattern(node.left, valueOf({ numbers: new Set([Number.NaN]) })) && strictMode()) {
        return { kind: 'throw', value: valueOf({ alwaysThrows: true }) };
      }
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const rightCompletion = visit(node.right);
      if (rightCompletion?.kind === 'throw') return rightCompletion;
      if (assignPattern(node.left, resolveValue(node.right)) && strictMode()) {
        return { kind: 'throw', value: valueOf({ alwaysThrows: true }) };
      }
      return;
    }
    if (ts.isDeleteExpression(node)) {
      const target = propertyKey(node.expression);
      if (target) {
        if (deleteAbstractProperty(target.base, target.keys) && strictMode()) {
          return { kind: 'throw', value: valueOf({ alwaysThrows: true }) };
        }
      }
      else if (hasExecutableProvenance(resolveValue(node.expression))) {
        calls.push({
          method: 'unknown', unsupported: 'dynamic callable name',
          expression: node.expression.getText(sf), position: node.pos,
        });
      }
      return;
    }
    if ((ts.isPrefixUnaryExpression(node) &&
         (node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken)) ||
        ts.isPostfixUnaryExpression(node)) {
      assignPattern(node.operand, valueOf({ numbers: new Set([Number.NaN]) }));
      return;
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require' &&
          ts.isStringLiteralLike(node.arguments[0])) {
        const result = importedValue(node.arguments[0].text, '*');
        if (functionStack.length === 0) topLevelExpressionResults.set(node, result);
        if (result.alwaysThrows) return { kind: 'throw', value: result };
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Object' &&
          ['freeze', 'seal', 'preventExtensions'].includes(node.expression.name.text)) {
        resolveValue(node);
        node.arguments.forEach(visit);
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Object' && node.expression.name.text === 'assign') {
        const target = resolveValue(node.arguments[0]);
        let failed = false;
        for (const argument of node.arguments.slice(1)) {
          const sourceValue = resolveValue(argument);
          target.external ||= sourceValue.external;
          for (const name of descriptorNames(sourceValue)) {
            const descriptor = ownDescriptor(sourceValue, name);
            if (!descriptor?.enumerable) continue;
            const assigned = readAbstractProperty(sourceValue, name);
            if (assigned) failed ||= writeAbstractProperty(target,
              valueOf({ strings: new Set([name]) }), assigned);
          }
        }
        if (functionStack.length === 0) topLevelExpressionResults.set(node, target);
        node.arguments.forEach(visit);
        if (failed) return { kind: 'throw', value: valueOf({ alwaysThrows: true }) };
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Object' &&
          ['defineProperty', 'defineProperties'].includes(node.expression.name.text)) {
        const target = resolveValue(node.arguments[0]);
        let success = true;
        let uncertain = false;
        if (node.expression.name.text === 'defineProperty') {
          const keys = resolveValue(node.arguments[1]);
          const conversion = convertPropertyDescriptor(resolveValue(node.arguments[2]));
          const names = [...keys.strings, ...[...keys.numbers].map(String)];
          if (keys.external || names.length === 0) {
            uncertain = true;
            const descriptorValue = readAbstractProperty(conversion.descriptor, 'value') ?? valueOf();
            invalidateSequence(target, [descriptorValue]);
          }
          else if (!conversion.valid || conversion.abrupt) success = false;
          else if (conversion.uncertain) {
            uncertain = true;
            for (const name of names) {
              setDataDescriptor(target, name, valueOf({
                external: true, callableCandidate: true,
              }));
            }
          }
          else names.forEach((name) => {
            if (success) success = applyPropertyDescriptor(target, name, conversion.descriptor);
          });
        } else {
          const descriptors = resolveValue(node.arguments[1]);
          const converted: Array<{ name: string; descriptor: AbstractValue }> = [];
          if (descriptors.external || !descriptors.exactShape) {
            uncertain = true;
            for (const name of descriptorNames(target)) {
              const current = ownDescriptor(target, name);
              if (current?.kind === 'data') {
                const unknown = valueOf({ external: true, callableCandidate: true });
                current.value = unknown;
                target.properties.set(name, unknown);
              }
            }
          }
          for (const name of descriptorNames(descriptors)) {
            if (!ownDescriptor(descriptors, name)?.enumerable) continue;
            const descriptor = readAbstractProperty(descriptors, name, descriptors);
            if (!descriptor || descriptor.alwaysThrows) {
              success = false;
              break;
            }
            const conversion = convertPropertyDescriptor(descriptor);
            if (!conversion.valid || conversion.abrupt) {
              success = false;
              break;
            }
            uncertain ||= conversion.uncertain;
            converted.push({ name, descriptor: conversion.descriptor });
          }
          if (success && !uncertain) {
            for (const entry of converted) {
              if (!applyPropertyDescriptor(target, entry.name, entry.descriptor)) {
                success = false;
                break;
              }
            }
          }
        }
        const result = success || uncertain ? target : valueOf({ alwaysThrows: true });
        if (functionStack.length === 0) topLevelExpressionResults.set(node, result);
        node.arguments.forEach(visit);
        if (!success && !uncertain) return { kind: 'throw', value: result };
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Reflect' &&
          ['get', 'getOwnPropertyDescriptor', 'getPrototypeOf']
            .includes(node.expression.name.text)) {
        const result = resolveValue(node);
        if (functionStack.length === 0) topLevelExpressionResults.set(node, result);
        node.arguments.forEach(visit);
        if (result.alwaysThrows) return { kind: 'throw', value: result };
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Object' &&
          ['getOwnPropertyDescriptor', 'getOwnPropertyDescriptors', 'getPrototypeOf']
            .includes(node.expression.name.text)) {
        const result = resolveValue(node);
        if (functionStack.length === 0) topLevelExpressionResults.set(node, result);
        node.arguments.forEach(visit);
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Reflect' &&
          ['set', 'defineProperty', 'deleteProperty', 'setPrototypeOf']
            .includes(node.expression.name.text)) {
        const target = resolveValue(node.arguments[0]);
        let success = true;
        if (node.expression.name.text === 'set') {
          success = !writeAbstractProperty(target, resolveValue(node.arguments[1]),
            resolveValue(node.arguments[2]),
            node.arguments[3] ? resolveValue(node.arguments[3]) : target);
        } else if (node.expression.name.text === 'deleteProperty') {
          success = !deleteAbstractProperty(target, resolveValue(node.arguments[1]));
        } else if (node.expression.name.text === 'setPrototypeOf') {
          if (['nonextensible', 'sealed', 'frozen'].includes(target.integrity ?? 'extensible')) {
            success = target.prototype === resolveValue(node.arguments[1]);
          } else target.prototype = resolveValue(node.arguments[1]);
        } else {
          const keys = resolveValue(node.arguments[1]);
          const conversion = convertPropertyDescriptor(resolveValue(node.arguments[2]));
          const names = [...keys.strings, ...[...keys.numbers].map(String)];
          success = !keys.external && names.length > 0 && conversion.valid &&
            !conversion.abrupt && !conversion.uncertain;
          names.forEach((name) => {
            if (success) success = applyPropertyDescriptor(target, name, conversion.descriptor);
          });
        }
        const result = valueOf({ primitives: new Set([success ? 'true' : 'false']) });
        if (functionStack.length === 0) topLevelExpressionResults.set(node, result);
        node.arguments.forEach(visit);
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Object' &&
          ['setPrototypeOf', 'create'].includes(node.expression.name.text)) {
        if (node.expression.name.text === 'create') {
          const result = resolveValue(node);
          if (functionStack.length === 0) topLevelExpressionResults.set(node, result);
          node.arguments.forEach(visit);
          if (result.alwaysThrows) return { kind: 'throw', value: result };
          return;
        }
        const target = resolveValue(node.arguments[0]);
        const prototype = resolveValue(node.arguments[
          node.expression.name.text === 'create' ? 0 : 1
        ]);
        const success = node.expression.name.text === 'create' ||
          !['nonextensible', 'sealed', 'frozen'].includes(target.integrity ?? 'extensible') ||
          target.prototype === prototype;
        if (success) target.prototype = prototype;
        const result = success ? target : valueOf({ alwaysThrows: true });
        if (functionStack.length === 0) topLevelExpressionResults.set(node, result);
        node.arguments.forEach(visit);
        if (!success) return { kind: 'throw', value: result };
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          ['forEach', 'map', 'filter', 'some', 'every', 'find', 'findIndex']
            .includes(node.expression.name.text)) {
        const collection = resolveValue(node.expression.expression);
        const callback = resolveValue(node.arguments[0]);
        const element = unionValues(
          collection.elements ?? valueOf(),
          valueOf({ external: collection.external || !collection.elements })
        );
        const callbackArguments = callback.boundArguments
          ? [...callback.boundArguments, element]
          : [element];
        for (const method of callback.methods) {
          const target = callbackArguments[0] ?? valueOf({ external: true });
          if (target.external || target.strings.size === 0) {
            calls.push({
              method, unsupported: 'dynamic target',
              expression: node.expression.expression.getText(sf), position: node.pos,
            });
          } else if (target.strings.size === 1) {
            calls.push({ method, target: [...target.strings][0], position: node.pos });
          } else {
            calls.push({
              method, targets: [...target.strings].sort(),
              expression: node.expression.expression.getText(sf),
              dynamicKind: 'target', dynamicValues: [...target.strings].sort(),
              position: node.pos,
            });
          }
        }
        let callbackThrows = false;
        for (const target of callback.functions) {
          callbackThrows ||= invokeFunction(
            target, parameterValues(target, callbackArguments)
          ).alwaysThrows;
        }
        if (callback.external && callback.callableCandidate) {
          calls.push({
            method: 'unknown', unsupported: 'dynamic callable name',
            expression: node.arguments[0]?.getText(sf) ?? '<missing callback>',
            position: node.pos,
          });
        }
        node.arguments.slice(1).forEach(visit);
        if (callbackThrows) {
          return { kind: 'throw', value: valueOf({ alwaysThrows: true }) };
        }
        return;
      }

      if (ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.name.text === 'from' || node.expression.name.text === 'rpc') &&
          receiverExcluded(node.expression.expression)) {
        node.arguments.forEach(visit);
        return;
      }

      const callable = resolveValue(node.expression);
      const receiver = ts.isPropertyAccessExpression(node.expression) ||
        ts.isElementAccessExpression(node.expression)
        ? resolveValue(node.expression.expression) : undefined;
      if (ts.isElementAccessExpression(node.expression)) {
        const receiver = node.expression.expression;
        const names = resolveValue(node.expression.argumentExpression);
        const dbMethods = [...names.strings].filter((name) => name === 'from' || name === 'rpc');
        if (!names.external && names.strings.size > 1 && dbMethods.length === 0 &&
            callable.methods.size === 0) {
          calls.push({ method: 'unknown', expression: node.expression.argumentExpression.getText(sf),
            dynamicKind: 'callable', dynamicValues: [...names.strings].sort(), position: node.pos });
        }
        if (callable.external && node.arguments.length > 0 && !receiverExcluded(receiver) &&
            (names.external || names.strings.size === 0 || dbMethods.length > 0)) {
          calls.push({
            method: 'unknown',
            unsupported: 'dynamic callable name',
            expression: node.expression.argumentExpression?.getText(sf) ?? '<missing>',
            position: node.pos,
          });
        }
      }
      const result = evaluateCallable(
        callable,
        invocationArgumentValues(node.arguments),
        receiver,
        {
          record: true,
          node,
          expression: node.expression.getText(sf),
          targetExpression: node.arguments[0]?.getText(sf),
        }
      );
      if (functionStack.length === 0) topLevelExpressionResults.set(node, result);
      if (result.alwaysThrows) return { kind: 'throw', value: result };
    }
    let completion: Completion | undefined;
    ts.forEachChild(node, (child) => {
      if (!completion) completion = visit(child);
    });
    return completion;
  }
  visit(sf);
  const unique = new Map<string, DiscoveredCall>();
  for (const call of calls) {
    const key = [call.position, call.method, call.unsupported ?? '', call.dynamicKind ?? '',
      call.expression ?? ''].join(':');
    const prior = unique.get(key);
    if (!prior) {
      unique.set(key, call);
      continue;
    }
    const values = new Set([
      ...(prior.target ? [prior.target] : prior.targets ?? prior.dynamicValues ?? []),
      ...(call.target ? [call.target] : call.targets ?? call.dynamicValues ?? []),
    ]);
    if (values.size === 1 && !prior.dynamicKind) prior.target = [...values][0];
    else if (values.size > 0) {
      prior.target = undefined;
      prior.targets = [...values].sort();
      prior.dynamicValues = [...values].sort();
    }
  }
  return [...unique.values()].map(({ position: _position, ...call }) => call);
}

function directTableTouchCount(source: string, file = 'probe.ts'): number {
  return discoverSupabaseCalls(source, file).filter((call) =>
    call.method === 'from' &&
    (call.target === 'contract_hours_ledger' ||
      call.targets?.includes('contract_hours_ledger'))).length;
}

function ledgerInsertShapes(source: string, file = 'probe.ts'): string[][] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX
      : file.endsWith('.js') ? ts.ScriptKind.JS
        : file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const shapes: string[][] = [];

  function chainTargetsLedger(expression: ts.Expression): boolean {
    if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
      return false;
    }
    if (expression.expression.name.text === 'from') {
      return expression.arguments.length === 1 &&
        ts.isStringLiteralLike(expression.arguments[0]) &&
        expression.arguments[0].text === 'contract_hours_ledger';
    }
    return chainTargetsLedger(expression.expression.expression);
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'insert' && chainTargetsLedger(node.expression.expression)) {
      const value = node.arguments[0];
      if (!value || !ts.isObjectLiteralExpression(value) ||
          value.properties.some((property) => !ts.isPropertyAssignment(property) &&
            !ts.isShorthandPropertyAssignment(property))) {
        throw new Error(`${file}: unsupported ledger INSERT shape`);
      }
      shapes.push(value.properties.map((property) => {
        const name = readPropertyName(property.name);
        if (!name) throw new Error(`${file}: dynamic ledger INSERT column`);
        return name;
      }).sort());
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return shapes;
}

function ledgerUpdateShapes(source: string, file = 'probe.ts'): string[][] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX
      : file.endsWith('.js') ? ts.ScriptKind.JS
        : file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const shapes: string[][] = [];

  function chainTargetsLedger(expression: ts.Expression): boolean {
    if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
      return false;
    }
    if (expression.expression.name.text === 'from') {
      return expression.arguments.length === 1 &&
        ts.isStringLiteralLike(expression.arguments[0]) &&
        expression.arguments[0].text === 'contract_hours_ledger';
    }
    return chainTargetsLedger(expression.expression.expression);
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'update' && chainTargetsLedger(node.expression.expression)) {
      const value = node.arguments[0];
      if (!value || !ts.isObjectLiteralExpression(value) ||
          value.properties.some((property) => !ts.isPropertyAssignment(property) &&
            !ts.isShorthandPropertyAssignment(property))) {
        throw new Error(`${file}: unsupported ledger UPDATE shape`);
      }
      shapes.push(value.properties.map((property) => {
        const name = readPropertyName(property.name);
        if (!name) throw new Error(`${file}: dynamic ledger UPDATE column`);
        return name;
      }).sort());
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return shapes;
}

const LEDGER_INSERT_SHAPES: Record<string, string[][]> = {
  'lib/services/hour-tracking.ts': [[
    'allocation_id', 'hours', 'is_manual', 'is_over_budget',
    'planned_minutes_snapshot', 'recorded_by', 'session_date', 'session_id', 'status',
  ]],
  'pages/api/contracts/[id]/hours/ledger/index.ts': [[
    'allocation_id', 'hours', 'is_manual', 'is_over_budget', 'notes',
    'recorded_by', 'session_date', 'session_id', 'status',
  ]],
};

const LEDGER_UPDATE_SHAPES: Record<string, string[][]> = {
  'lib/services/hour-tracking.ts': [
    ['status', 'updated_at', 'updated_by'],
    [
      'admin_override', 'admin_override_reason', 'cancellation_clause',
      'cancellation_reason', 'status', 'updated_at', 'updated_by',
    ],
    [
      'admin_override', 'admin_override_reason', 'cancellation_clause',
      'cancellation_reason', 'status', 'updated_at', 'updated_by',
    ],
  ],
  'pages/api/contracts/[id]/hours/ledger/[ledgerId].ts': [[
    'admin_override', 'admin_override_reason', 'status', 'updated_at', 'updated_by',
  ]],
};

const DIRECT_TS_TOUCHES: Record<string, UseClass[]> = {
  'components/workspace/WorkspaceSessionsTab.tsx': ['status-only'],
  'lib/services/hour-tracking.ts': [
    'write', 'status-only', 'write', 'status-only', 'write', 'write',
  ],
  'lib/services/school-hours-report.ts': ['billable'],
  'pages/admin/sessions/index.tsx': ['status-only'],
  'pages/api/admin/consultant-rates/[id].ts': ['status-only', 'status-only'],
  'pages/api/admin/sessions/[id]/hours-comparison.ts': ['historical'],
  'pages/api/consultant-earnings/[consultant_id].ts': ['billable'],
  'pages/api/contracts/[id]/hours/allocate.ts': ['status-only'],
  'pages/api/contracts/[id]/hours/ledger/[ledgerId].ts': ['status-only', 'write'],
  'pages/api/contracts/[id]/hours/ledger/csv.ts': ['billable'],
  'pages/api/contracts/[id]/hours/ledger/index.ts': ['historical', 'write'],
  'pages/api/sessions/[id]/approve.ts': ['write'],
  'pages/api/sessions/reports/analytics.ts': ['aggregate'],
  'pages/consultor/sessions/index.tsx': ['status-only'],
};

interface SqlObjectDefinition {
  file: string;
  type: 'function' | 'procedure' | 'view' | 'materialized view';
  name: string;
  body: string;
}

function sqlObjectDefinitions(source: string, file: string): SqlObjectDefinition[] {
  const definitions: SqlObjectDefinition[] = [];
  const functionPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+(?:"?public"?\.)?"?([A-Za-z_][\w]*)"?[\s\S]*?\bAS\s+\$([A-Za-z0-9_]*)\$([\s\S]*?)\$\3\$/gi;
  for (const match of source.matchAll(functionPattern)) {
    definitions.push({
      file,
      type: match[1].toLowerCase() as 'function' | 'procedure',
      name: match[2],
      body: match[4],
    });
  }
  const viewPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?((?:MATERIALIZED\s+)?VIEW)\s+(?:"?public"?\.)?"?([A-Za-z_][\w]*)"?\s+AS\s+([\s\S]*?);/gi;
  for (const match of source.matchAll(viewPattern)) {
    definitions.push({
      file,
      type: match[1].toLowerCase() as 'view' | 'materialized view',
      name: match[2],
      body: match[3],
    });
  }
  return definitions;
}

function directSqlLedgerDependency(body: string): boolean {
  if (tokenizeSql(body).some((token) =>
    token.kind === 'word' && token.value === 'contract_hours_ledger')) return true;
  return executableSqlExpressions(body).some((expression) => {
    const recovered = staticSqlExpression(expression);
    if (recovered !== undefined) {
      return tokenizeSql(recovered).some((token) =>
        token.kind === 'word' && token.value === 'contract_hours_ledger');
    }
    // An unresolved executable target may name the ledger. Treat it as a
    // potential dependency; the caller separately requires an explicit
    // unsupported classification rather than silently accepting it.
    return true;
  });
}

function ledgerObjectNames(definitions: SqlObjectDefinition[]): Set<string> {
  const names = new Set(
    definitions
      .filter((definition) => directSqlLedgerDependency(definition.body))
      .map((definition) => definition.name)
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of definitions) {
      if (names.has(definition.name)) continue;
      const identifiers = new Set(tokenizeSql(definition.body)
        .filter((token) => token.kind === 'word')
        .map((token) => token.value));
      if ([...names].some((name) => identifiers.has(name))) {
        names.add(definition.name);
        changed = true;
      }
    }
  }
  return names;
}

function indirectCalls(source: string, targets: Set<string>, file = 'probe.ts'): string[] {
  return discoverSupabaseCalls(source, file)
    .flatMap((call) => {
      const resolved = call.target ? [call.target] : call.targets ?? [];
      return resolved.filter((target) => targets.has(target));
    });
}

/** Source-order role + authority; `non-authoritative` means no financial write trusts it. */
const INDIRECT_TS_CONSUMERS: Record<string, string[]> = {
  'lib/services/hour-tracking.ts': [
    'get_bucket_summary:write-precondition/fail-closed',
    'apply_session_reschedule:write/fail-closed',
  ],
  'lib/services/school-hours-report.ts': ['get_bucket_summary:aggregate/fail-closed'],
  'pages/admin/sessions/create.tsx': ['get_bucket_summary:financial-preview/non-authoritative'],
  'pages/api/admin/sessions/[id]/hour-override.ts': [
    'apply_session_hour_override:write/fail-closed-admin-db-auth',
  ],
  'pages/api/consultant-earnings/[consultant_id].ts': [
    'get_consultant_earnings:billable/fail-closed',
  ],
  'pages/api/consultant-earnings/[consultant_id]/pdf.ts': [
    'get_consultant_earnings:billable/fail-closed',
  ],
  'pages/api/contracts/[id]/hours/index.ts': ['get_bucket_summary:aggregate/fail-closed'],
  'pages/api/contracts/[id]/hours/reallocate.ts': [
    'get_bucket_summary:write-precondition/fail-closed',
    'get_bucket_summary:post-write-display/non-authoritative',
  ],
};

interface DynamicAllowance {
  allowedValues: string[];
  justification: string;
}

const DYNAMIC_NON_LEDGER_CALLS: Record<string, DynamicAllowance> = {
  'lib/propuestas/scripts/seed-db.ts:from:target:t': {
    allowedValues: [
      'propuesta_fichas_servicio', 'propuesta_consultores',
      'propuesta_documentos_biblioteca', 'propuesta_contenido_bloques',
      'propuesta_plantillas',
    ],
    justification: 'closed proposal seed-table literal list',
  },
  'lib/zoom/attendance-store.ts:from:target:source.table': {
    allowedValues: ['meeting_attendees', 'session_attendees'],
    justification: 'closed attendance identity-source descriptor',
  },
  'utils/meetingUtils.ts:from:target:tableName': {
    allowedValues: ['meeting_commitments', 'meeting_tasks'],
    justification: 'closed meeting-child selector',
  },
  'hooks/useUrlState.ts:unknown:callable:method': {
    allowedValues: ['push', 'replace'],
    justification: 'closed Next router method selector, not a database callable',
  },
};

function dynamicCallKey(file: string, call: DiscoveredCall): string {
  return `${file}:${call.method}:${call.dynamicKind}:${call.expression}`;
}

interface SqlToken {
  kind: 'word' | 'symbol';
  value: string;
}

interface SqlAnalysis {
  count: number;
  backed: boolean;
  relations: Set<string>;
  unsupported: string[];
}

function sqlQuotedValue(source: string, start: number): { value: string; end: number } | undefined {
  if (source[start] !== "'") return undefined;
  let value = '';
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "'" && source[index + 1] === "'") {
      value += "'";
      index += 2;
      continue;
    }
    if (source[index] === "'") return { value, end: index + 1 };
    value += source[index];
    index += 1;
  }
  return undefined;
}

function splitStaticSqlArguments(source: string): string[] | undefined {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let index = 0;
  while (index < source.length) {
    if (source[index] === "'") {
      const quoted = sqlQuotedValue(source, index);
      if (!quoted) return undefined;
      index = quoted.end;
      continue;
    }
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') depth -= 1;
    else if (source[index] === ',' && depth === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
    index += 1;
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function staticSqlExpression(expression: string): string | undefined {
  let trimmed = expression.trim();
  while (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  const dollar = trimmed.match(/^\$([A-Za-z0-9_]*)\$([\s\S]*)\$\1\$$/);
  if (dollar) return dollar[2];

  const format = trimmed.match(/^format\s*\(([\s\S]*)\)$/i);
  if (format) {
    const parts = splitStaticSqlArguments(format[1]);
    if (!parts || parts.length === 0) return undefined;
    const templateLiteral = sqlQuotedValue(parts[0], 0);
    if (!templateLiteral || templateLiteral.end !== parts[0].length) return undefined;
    const args: string[] = [];
    for (const part of parts.slice(1)) {
      const literal = sqlQuotedValue(part, 0);
      if (!literal || literal.end !== part.length) return undefined;
      args.push(literal.value);
    }
    let argument = 0;
    let unresolved = false;
    const rendered = templateLiteral.value.replace(/%(?:%|I|L|s)/g, (placeholder) => {
      if (placeholder === '%%') return '%';
      const value = args[argument++];
      if (value === undefined) { unresolved = true; return ''; }
      if (placeholder === '%I') return `"${value.replace(/"/g, '""')}"`;
      if (placeholder === '%L') return `'${value.replace(/'/g, "''")}'`;
      return value;
    });
    return unresolved || argument !== args.length ? undefined : rendered;
  }

  const pieces: string[] = [];
  let index = 0;
  while (index < trimmed.length) {
    while (/\s/.test(trimmed[index] ?? '')) index += 1;
    const literal = sqlQuotedValue(trimmed, index);
    if (!literal) return undefined;
    pieces.push(literal.value);
    index = literal.end;
    while (/\s/.test(trimmed[index] ?? '')) index += 1;
    if (index === trimmed.length) break;
    if (trimmed.slice(index, index + 2) !== '||') return undefined;
    index += 2;
  }
  return pieces.length > 0 ? pieces.join('') : undefined;
}

function executableSqlExpressions(source: string): string[] {
  const expressions: string[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('--', index)) {
      const newline = source.indexOf('\n', index + 2);
      index = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const close = source.indexOf('*/', index + 2);
      index = close < 0 ? source.length : close + 2;
      continue;
    }
    if (source[index] === "'") {
      index = sqlQuotedValue(source, index)?.end ?? source.length;
      continue;
    }
    const execute = source.slice(index).match(/^execute\b/i)?.[0];
    if (!execute) { index += 1; continue; }
    const afterExecute = source.slice(index + execute.length).match(/^\s*([A-Za-z_]+)/)?.[1]
      ?.toLowerCase();
    if (afterExecute === 'on' || afterExecute === 'function' || afterExecute === 'procedure') {
      index += execute.length;
      continue;
    }
    let cursor = index + execute.length;
    let depth = 0;
    const start = cursor;
    while (cursor < source.length) {
      if (source[cursor] === "'") {
        cursor = sqlQuotedValue(source, cursor)?.end ?? source.length;
        continue;
      }
      if (source[cursor] === '$') {
        const delimiter = source.slice(cursor).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
        if (delimiter) {
          const close = source.indexOf(delimiter, cursor + delimiter.length);
          cursor = close < 0 ? source.length : close + delimiter.length;
          continue;
        }
      }
      if (source[cursor] === '(') depth += 1;
      else if (source[cursor] === ')') depth -= 1;
      if (depth === 0 && source[cursor] === ';') break;
      if (depth === 0 && /^(?:using|into|loop)\b/i.test(source.slice(cursor)) &&
          /\s/.test(source[cursor - 1] ?? ' ')) break;
      cursor += 1;
    }
    expressions.push(source.slice(start, cursor).trim());
    index = cursor + 1;
  }
  return expressions;
}

function stripSqlCommentsAndStrings(source: string): string {
  let result = '';
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('--', index)) {
      const newline = source.indexOf('\n', index + 2);
      result += newline < 0 ? ' '.repeat(source.length - index) :
        ' '.repeat(newline - index) + '\n';
      index = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      let depth = 1;
      const start = index;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith('/*', index)) { depth += 1; index += 2; }
        else if (source.startsWith('*/', index)) { depth -= 1; index += 2; }
        else index += 1;
      }
      result += ' '.repeat(index - start);
      continue;
    }
    if (source[index] === "'") {
      const quoted = sqlQuotedValue(source, index);
      const end = quoted?.end ?? source.length;
      result += ' '.repeat(end - index);
      index = end;
      continue;
    }
    result += source[index];
    index += 1;
  }
  return result;
}

function schemaLedgerUnsupported(source: string): string[] {
  const unsupported: string[] = [];
  const executableSource = stripSqlCommentsAndStrings(source);
  const ledger = '(?:"?public"?\\s*\\.\\s*)?"?contract_hours_ledger"?';
  const routineHeaders = executableSource.match(
    /create\s+(?:or\s+replace\s+)?(?:function|procedure)[\s\S]*?(?:\breturns\b|\blanguage\b|\bas\s+\$)/gi
  ) ?? [];
  if (routineHeaders.some((header) => new RegExp(`\\([^)]*${ledger}[^)]*\\)`, 'i').test(header)) ||
      new RegExp(`\\breturns\\s+(?:setof\\s+)?${ledger}\\b`, 'i').test(executableSource) ||
      new RegExp(`\\breturns\\s+table\\s*\\([^)]*${ledger}[^)]*\\)`, 'i')
        .test(executableSource)) {
    unsupported.push('ledger composite routine signature requires explicit classification');
  }
  if (new RegExp(`${ledger}\\s*%\\s*rowtype\\b`, 'i').test(executableSource)) {
    unsupported.push('ledger %ROWTYPE dependency requires explicit classification');
  }
  if (new RegExp(`\\bdeclare\\b[\\s\\S]*?\\b[A-Za-z_][A-Za-z0-9_]*\\s+${ledger}\\s*(?:;|:=)`, 'i')
      .test(executableSource)) {
    unsupported.push('ledger composite variable requires explicit classification');
  }
  if (new RegExp(`::\\s*${ledger}\\b`, 'i').test(executableSource)) {
    unsupported.push('ledger composite cast requires explicit classification');
  }
  if (new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?(?:constraint\\s+)?trigger[^;]*?\\bon\\s+${ledger}\\b`,
    'i'
  ).test(executableSource)) {
    unsupported.push('ledger trigger authority requires explicit classification');
  }
  if (new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?rule[^;]*?\\bon\\s+(?:(?:select|insert|update|delete)\\s+to\\s+)?${ledger}\\b`,
    'i'
  ).test(executableSource)) {
    unsupported.push('ledger rule authority requires explicit classification');
  }
  return unsupported;
}

/** PostgreSQL-aware lexical floor: comments and literals disappear; identifiers survive. */
function tokenizeSql(source: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  let bodyDelimiter: string | null = null;

  while (index < source.length) {
    if (bodyDelimiter && source.startsWith(bodyDelimiter, index)) {
      index += bodyDelimiter.length;
      bodyDelimiter = null;
      continue;
    }
    if (/\s/.test(source[index])) { index += 1; continue; }
    if (source.startsWith('--', index)) {
      index = source.indexOf('\n', index + 2);
      if (index < 0) break;
      continue;
    }
    if (source.startsWith('/*', index)) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith('/*', index)) { depth += 1; index += 2; }
        else if (source.startsWith('*/', index)) { depth -= 1; index += 2; }
        else index += 1;
      }
      continue;
    }
    if (source[index] === "'") {
      index += 1;
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") { index += 2; continue; }
        if (source[index] === "'") { index += 1; break; }
        index += 1;
      }
      continue;
    }
    if (source[index] === '$') {
      const delimiter = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
      if (delimiter) {
        const previous = tokens.at(-1)?.value;
        if (previous === 'as' || previous === 'do') {
          bodyDelimiter = delimiter;
          index += delimiter.length;
        } else {
          const close = source.indexOf(delimiter, index + delimiter.length);
          index = close < 0 ? source.length : close + delimiter.length;
        }
        continue;
      }
    }
    if (source[index] === '"') {
      let value = '';
      index += 1;
      while (index < source.length) {
        if (source[index] === '"' && source[index + 1] === '"') {
          value += '"'; index += 2; continue;
        }
        if (source[index] === '"') { index += 1; break; }
        value += source[index];
        index += 1;
      }
      tokens.push({ kind: 'word', value: value.toLowerCase() });
      continue;
    }
    const word = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    if (word) {
      tokens.push({ kind: 'word', value: word.toLowerCase() });
      index += word.length;
      continue;
    }
    tokens.push({ kind: 'symbol', value: source[index] });
    index += 1;
  }
  return tokens;
}

function matchingParens(tokens: SqlToken[]): Map<number, number> {
  const stack: number[] = [];
  const pairs = new Map<number, number>();
  tokens.forEach((token, index) => {
    if (token.value === '(') stack.push(index);
    if (token.value === ')') {
      const open = stack.pop();
      if (open !== undefined) pairs.set(open, index);
    }
  });
  return pairs;
}

const SQL_RESERVED = new Set([
  'as', 'where', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'full', 'on',
  'group', 'order', 'limit', 'offset', 'union', 'returning', 'set', 'values', 'using',
]);

function sqlHoursAnalysis(source: string, file = 'probe.sql'): SqlAnalysis {
  const tokens = tokenizeSql(source);
  const pairs = matchingParens(tokens);
  const definitions = sqlObjectDefinitions(source, 'inline.sql');
  const knownBacked = ledgerObjectNames(definitions);

  function analyze(
    start: number,
    end: number,
    inheritedObjects: Set<string>,
    outerBackedAliases: Set<string> = new Set()
  ): SqlAnalysis {
    const ctes = new Map<string, { open: number; close: number }>();
    const cteDeclarationPositions = new Set<number>();
    for (let index = start; index < end; index += 1) {
      if (tokens[index]?.kind !== 'word' || tokens[index + 1]?.value !== 'as' ||
          tokens[index + 2]?.value !== '(') continue;
      const close = pairs.get(index + 2);
      if (close !== undefined && close < end) {
        ctes.set(tokens[index].value, { open: index + 2, close });
        cteDeclarationPositions.add(index);
      }
    }

    const backedNames = new Set(inheritedObjects);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, range] of ctes) {
        if (backedNames.has(name)) continue;
        const result = analyze(range.open + 1, range.close, backedNames, outerBackedAliases);
        if (result.backed) { backedNames.add(name); changed = true; }
      }
    }

    const childRanges = new Map<number, { close: number; analysis: SqlAnalysis }>();
    for (let index = start; index < end; index += 1) {
      if (tokens[index]?.value !== '(') continue;
      const close = pairs.get(index);
      if (close === undefined || close >= end) continue;
      const first = tokens[index + 1]?.value;
      if (first === 'select' || first === 'with' || first === 'update' || first === 'insert') {
        childRanges.set(index, {
          close,
          analysis: analyze(index + 1, close, backedNames, outerBackedAliases),
        });
        index = close;
      }
    }

    const aliases = new Set<string>();
    const allLocalAliases = new Set<string>();
    const relations = new Set<string>();
    const relationDeclarationPositions = new Set<number>();
    let localBacked = false;
    const atTop = (position: number): boolean => {
      for (const [open, child] of childRanges) {
        if (position > open && position < child.close) return false;
      }
      return true;
    };

    for (let index = start; index < end; index += 1) {
      if (!atTop(index)) continue;
      const keyword = tokens[index]?.value;
      if (keyword !== 'from' && keyword !== 'join' && keyword !== 'update' &&
          !(keyword === 'into' && tokens.slice(start, index).some((token) =>
            token.value === 'insert' || token.value === 'merge')) &&
          !(keyword === 'using' && tokens.slice(start, index).some((token) =>
            token.value === 'merge'))) {
        continue;
      }
      let cursor = index + 1;
      if (tokens[cursor]?.value === 'lateral') cursor += 1;
      if (tokens[cursor]?.value === '(' && childRanges.has(cursor)) {
        const child = childRanges.get(cursor)!;
        cursor = child.close + 1;
        if (tokens[cursor]?.value === 'as') cursor += 1;
        const alias = tokens[cursor]?.kind === 'word' ? tokens[cursor].value : undefined;
        if (alias) {
          allLocalAliases.add(alias);
          relationDeclarationPositions.add(cursor);
        }
        if (child.analysis.backed && alias) { aliases.add(alias); localBacked = true; }
        continue;
      }
      if (tokens[cursor]?.kind !== 'word') continue;
      const relationPosition = cursor;
      let relationSchema: string | undefined;
      let relation = tokens[cursor].value;
      if (tokens[cursor + 1]?.value === '.' && tokens[cursor + 2]?.kind === 'word') {
        relationSchema = relation;
        relation = tokens[cursor + 2].value;
        cursor += 2;
      }
      relationDeclarationPositions.add(relationPosition);
      relationDeclarationPositions.add(cursor);
      relations.add(relation);
      const qualifiedLedger = relationSchema === 'public' && relation === 'contract_hours_ledger';
      const relationBacked = qualifiedLedger || (!relationSchema && ctes.has(relation)
        ? backedNames.has(relation)
        : relation === 'contract_hours_ledger' || backedNames.has(relation));
      cursor += 1;
      if (tokens[cursor]?.value === '(') cursor = (pairs.get(cursor) ?? cursor) + 1;
      if (tokens[cursor]?.value === 'as') cursor += 1;
      const possibleAlias = tokens[cursor]?.kind === 'word' && !SQL_RESERVED.has(tokens[cursor].value)
        ? tokens[cursor].value : undefined;
      if (possibleAlias) relationDeclarationPositions.add(cursor);
      allLocalAliases.add(relation);
      if (possibleAlias) allLocalAliases.add(possibleAlias);
      if (relationBacked) {
        localBacked = true;
        aliases.add(relation);
        if (possibleAlias) aliases.add(possibleAlias);
      }
    }

    // A correlated child can read a ledger alias established by this scope even
    // though its SELECT text appears before this scope's FROM clause. Local aliases
    // shadow outer names, including when the local relation is not ledger-backed.
    const childVisible = new Set(outerBackedAliases);
    for (const name of allLocalAliases) childVisible.delete(name);
    for (const name of aliases) childVisible.add(name);
    for (const [open, child] of childRanges) {
      child.analysis = analyze(open + 1, child.close, backedNames, childVisible);
    }

    let queryStart = end;
    for (let index = start; index < end; index += 1) {
      if (!atTop(index)) continue;
      if (['select', 'update', 'insert', 'delete', 'merge', 'with'].includes(tokens[index]?.value)) {
        queryStart = index;
        break;
      }
    }

    let count = 0;
    if (localBacked || outerBackedAliases.size > 0) {
      for (let index = queryStart; index < end; index += 1) {
        if (!atTop(index)) continue;
        if (tokens[index]?.value === 'hours') {
          if (tokens[index - 1]?.value === 'as') continue;
          if (tokens[index - 1]?.value === '.') {
            const qualifier = tokens[index - 2]?.value;
            if (qualifier && (aliases.has(qualifier) ||
                (!allLocalAliases.has(qualifier) && outerBackedAliases.has(qualifier)))) count += 1;
          } else if (localBacked || allLocalAliases.size === 0) {
            count += 1;
          }
          continue;
        }
        if (tokens[index]?.value !== '*') continue;
        const qualifier = tokens[index - 1]?.value === '.' ? tokens[index - 2]?.value : undefined;
        if (qualifier) {
          if (aliases.has(qualifier) ||
              (!allLocalAliases.has(qualifier) && outerBackedAliases.has(qualifier))) count += 1;
          continue;
        }
        // A whole-row star begins a SELECT/RETURNING item. Arithmetic and COUNT(*)
        // are not whole-row reads merely because they occur later in that clause.
        const previous = tokens[index - 1]?.value;
        const wholeRowPrefix = previous === 'select' || previous === 'distinct' ||
          previous === 'returning' || previous === ',';
        if (wholeRowPrefix && (localBacked || allLocalAliases.size === 0)) {
          count += 1;
        }
      }

      // A composite row is exposed without a star in SELECT l, row_to_json(l),
      // RETURNING l, and equivalent function arguments. Relation declarations and
      // qualifiers (l.hours) are excluded because those are classified separately.
      for (let index = queryStart; index < end; index += 1) {
        if (!atTop(index) || relationDeclarationPositions.has(index) ||
            cteDeclarationPositions.has(index)) continue;
        const name = tokens[index]?.value;
        if (!name || tokens[index]?.kind !== 'word') continue;
        const isBackedComposite = aliases.has(name) ||
          (!allLocalAliases.has(name) && outerBackedAliases.has(name));
        if (!isBackedComposite) continue;
        if (tokens[index + 1]?.value === '.') continue;
        count += 1;
      }
    }

    const unsupported: string[] = [];
    for (const child of childRanges.values()) {
      count += child.analysis.count;
      child.analysis.unsupported.forEach((entry) => unsupported.push(entry));
      child.analysis.relations.forEach((entry) => relations.add(entry));
    }
    const hasLedgerWord = tokens.slice(start, end).some((token) =>
      token.kind === 'word' && token.value === 'contract_hours_ledger'
    );
    const schemaLead = new Set([
      'alter', 'comment', 'create', 'drop', 'grant', 'revoke',
    ]);
    const hasDml = !schemaLead.has(tokens[start]?.value) &&
      tokens.slice(start, end).some((token) =>
        ['select', 'update', 'insert', 'delete', 'merge', 'with', 'table', 'copy']
          .includes(token.value)
      );
    const hasMerge = tokens.slice(start, end).some((token) => token.value === 'merge');
    if (hasMerge && (localBacked || hasLedgerWord ||
        [...childRanges.values()].some((child) => child.analysis.backed))) {
      unsupported.push('ledger-relevant MERGE requires explicit classification');
    }
    if (hasLedgerWord && !ctes.has('contract_hours_ledger') &&
        hasDml && !localBacked && count === 0) {
      unsupported.push('ledger-relevant statement could not be classified');
    }
    const topLevelVerb = (() => {
      if (tokens[queryStart]?.value !== 'with') return tokens[queryStart]?.value;
      for (let index = queryStart + 1; index < end; index += 1) {
        if (atTop(index) && ['select', 'insert', 'update', 'delete', 'merge']
          .includes(tokens[index]?.value)) return tokens[index].value;
      }
      return undefined;
    })();
    const mutatesLedger = localBacked &&
      ['insert', 'update', 'delete', 'merge'].includes(topLevelVerb ?? '');
    if (mutatesLedger && count === 0 && !hasMerge) {
      // A status-only or otherwise column-opaque ledger mutation is still a direct
      // ledger authority touch and must change the exact production map.
      count += 1;
    }
    return {
      count,
      backed: localBacked || [...childRanges.values()].some((child) => child.analysis.backed),
      relations,
      unsupported,
    };
  }

  let count = 0;
  let backed = false;
  const relations = new Set<string>();
  const unsupported: string[] = [];
  let start = 0;
  for (let index = 0; index <= tokens.length; index += 1) {
    if (index < tokens.length && tokens[index].value !== ';') continue;
    const result = analyze(start, index, knownBacked);
    count += result.count;
    backed ||= result.backed;
    result.relations.forEach((entry) => relations.add(entry));
    result.unsupported.forEach((entry) => unsupported.push(entry));
    start = index + 1;
  }
  schemaLedgerUnsupported(source).forEach((entry) => unsupported.push(entry));
  const executableExpressions = executableSqlExpressions(source);
  for (const expression of executableExpressions) {
    const recovered = staticSqlExpression(expression);
    if (recovered === undefined) {
      // An incomplete runtime domain can always be redirected to the ledger.
      // Count it as potential ledger authority and fail explicitly; there are no
      // filename or literal-substring exemptions.
      count += 1;
      backed = true;
      relations.add('contract_hours_ledger');
      unsupported.push(`dynamic EXECUTE target is not statically recoverable: ${expression}`);
      continue;
    }
    const dynamic = sqlHoursAnalysis(recovered, file);
    count += dynamic.count;
    backed ||= dynamic.backed;
    dynamic.relations.forEach((entry) => relations.add(entry));
    dynamic.unsupported.forEach((entry) => unsupported.push(`EXECUTE: ${entry}`));
  }
  return { count, backed, relations, unsupported };
}

function sqlDirectHoursUseCount(source: string, file = 'probe.sql'): number {
  const analysis = sqlHoursAnalysis(source, file);
  if (analysis.unsupported.length > 0) {
    throw new Error(analysis.unsupported.join('; '));
  }
  return analysis.count;
}

const SQL_DIRECT_HOURS_USES: Record<string, UseClass[]> = {
  'supabase/migrations/00000000000000_baseline.sql': [
    'historical', 'historical', 'historical', 'historical', 'historical', 'historical',
    'write', 'write',
  ],
  'supabase/migrations/20260803170000_add_email_marketing_tables.sql': [
    'write',
  ],
  'supabase/migrations/20260805120000_reschedule_hours_rpc.sql': [
    'historical', 'historical', 'historical', 'historical', 'historical',
  ],
  'supabase/migrations/20260808120000_session_reschedule_atomic.sql': [
    'write',
  ],
  'supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql': [
    'historical', 'historical',
  ],
  'supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql': [
    'historical', 'historical', 'write',
  ],
  'supabase/migrations/20260813120200_session_hour_overrides.sql': [
    'write', 'aggregate', 'aggregate', 'billable', 'billable', 'billable',
    'write',
  ],
  'supabase/migrations/20260813120300_reschedule_availability_guard.sql': [
    'historical', 'write', 'historical',
  ],
  'supabase/migrations/20260813120500_reschedule_tracking_pair_guard.sql': [
    'historical', 'write', 'historical',
  ],
};

const SQL_LEDGER_OBJECTS: Record<string, string[]> = {
  'supabase/migrations/00000000000000_baseline.sql': [
    'exec_sql:write/potential-dynamic/direct',
    'get_bucket_summary:historical/direct',
    'get_consultant_earnings:historical/direct',
    'migrate_assignments_to_enrollments:write/potential-dynamic/direct',
  ],
  'supabase/migrations/20260805120000_reschedule_hours_rpc.sql': [
    'reschedule_session_hours:historical/direct',
  ],
  'supabase/migrations/20260808120000_session_reschedule_atomic.sql': [
    'apply_session_reschedule:write/fail-closed/direct',
  ],
  'supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql': [
    'get_bucket_summary:historical/direct',
  ],
  'supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql': [
    'reschedule_session_hours:write/fail-closed/direct',
  ],
  'supabase/migrations/20260813120200_session_hour_overrides.sql': [
    'apply_session_hour_override:write/fail-closed/direct',
    'get_bucket_summary:aggregate/direct',
    'get_consultant_earnings:billable/direct',
  ],
  'supabase/migrations/20260813120300_reschedule_availability_guard.sql': [
    'reschedule_session_hours:write/fail-closed/direct',
  ],
  'supabase/migrations/20260813120500_reschedule_tracking_pair_guard.sql': [
    'reschedule_session_hours:write/fail-closed/direct',
  ],
};

/** Every unresolved executable SQL target is explicit; none is an allowed omission. */
const SQL_UNSUPPORTED_EXECUTES: Record<string, string[]> = {
  'supabase/migrations/00000000000000_baseline.sql': [
    'exec_sql:caller-controlled-retired',
    'migrate_assignments_to_enrollments:runtime-column-domain',
  ],
  'supabase/migrations/20260803170000_add_email_marketing_tables.sql': [
    'email-policy:runtime-table-domain',
  ],
  'supabase/migrations/20260808120000_session_reschedule_atomic.sql': [
    'apply_session_reschedule:runtime-update-shape',
  ],
  'supabase/migrations/20260813120200_session_hour_overrides.sql': [
    'grant-loop:runtime-role-domain',
  ],
};

const SQL_UNSUPPORTED_OBJECTS: Record<string, string[]> = {
  'supabase/migrations/00000000000000_baseline.sql': [
    'exec_sql',
    'migrate_assignments_to_enrollments',
  ],
  'supabase/migrations/20260808120000_session_reschedule_atomic.sql': [
    'apply_session_reschedule',
  ],
};

function expectExactCounts(actual: Record<string, number>, expected: Record<string, unknown[]>): void {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [path, count] of Object.entries(actual)) {
    expect(expected[path], `${path}; actual census ${JSON.stringify(actual)}`).toHaveLength(count);
  }
}

describe('contract_hours_ledger production consumer inventory', () => {
  const migrationFiles = filesBelow(join(ROOT, 'supabase/migrations'))
    .filter((candidate) => candidate.endsWith('.sql'));
  const definitions = migrationFiles.flatMap((path) =>
    sqlObjectDefinitions(readFileSync(path, 'utf8'), relative(ROOT, path))
  );
  const objectNames = ledgerObjectNames(definitions);

  it('scans every production TypeScript root and classifies all direct table touches', () => {
    const actual: Record<string, number> = {};
    for (const path of productionSourceFiles()) {
      const source = readFileSync(path, 'utf8');
      const count = directTableTouchCount(source, path);
      if (count > 0) actual[relative(ROOT, path)] = count;
    }
    expectExactCounts(actual, DIRECT_TS_TOUCHES);
  });

  it('mechanically inventories every production ledger INSERT column', () => {
    const actual: Record<string, string[][]> = {};
    for (const path of productionSourceFiles()) {
      const relativePath = relative(ROOT, path);
      const shapes = ledgerInsertShapes(readFileSync(path, 'utf8'), relativePath);
      if (shapes.length > 0) actual[relativePath] = shapes;
    }
    expect(actual).toEqual(LEDGER_INSERT_SHAPES);
    const allowedColumns = new Set(Object.values(actual).flat(2));
    expect([...allowedColumns].sort()).toEqual([
      'allocation_id', 'hours', 'is_manual', 'is_over_budget', 'notes',
      'planned_minutes_snapshot', 'recorded_by', 'session_date', 'session_id', 'status',
    ]);
    expect(allowedColumns.has('effective_minutes')).toBe(false);
  });

  it('mechanically derives the exact exposed-role ledger UPDATE grant', () => {
    const actual: Record<string, string[][]> = {};
    for (const path of productionSourceFiles()) {
      const relativePath = relative(ROOT, path);
      const shapes = ledgerUpdateShapes(readFileSync(path, 'utf8'), relativePath);
      if (shapes.length > 0) actual[relativePath] = shapes;
    }
    expect(actual).toEqual(LEDGER_UPDATE_SHAPES);
    const allowedColumns = new Set(Object.values(actual).flat(2));
    expect([...allowedColumns].sort()).toEqual([
      'admin_override', 'admin_override_reason', 'cancellation_clause',
      'cancellation_reason', 'status', 'updated_at', 'updated_by',
    ]);
    expect(allowedColumns.has('hours')).toBe(false);
    expect(allowedColumns.has('effective_minutes')).toBe(false);
    expect(allowedColumns.has('planned_minutes_snapshot')).toBe(false);
  });

  it('fails closed on every unsupported dynamic callable or target in production', () => {
    const dynamic = productionSourceFiles().flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return discoverSupabaseCalls(source, path)
        .filter((call) => call.unsupported || call.dynamicKind)
        .map((call) => ({ file: relative(ROOT, path), call }));
    });
    expect(dynamic.filter(({ call }) => call.unsupported)).toEqual([]);
    expect(dynamic.map(({ file, call }) => dynamicCallKey(file, call)).sort())
      .toEqual(Object.keys(DYNAMIC_NON_LEDGER_CALLS).sort());

    for (const { file, call } of dynamic) {
      const key = dynamicCallKey(file, call);
      const allowance = DYNAMIC_NON_LEDGER_CALLS[key];
      expect(call.dynamicValues, `${key}: ${allowance.justification}`).toEqual(
        [...allowance.allowedValues].sort()
      );
      expect(call.dynamicValues).not.toContain('contract_hours_ledger');
      expect(call.dynamicValues?.some((value) => objectNames.has(value))).toBe(false);
    }
  });

  it('classifies every direct or transitive SQL function/view consumer', () => {
    const actual: Record<string, number> = {};
    const unsupported: Record<string, string[]> = {};
    const directNames = new Set(
      definitions
        .filter((definition) => directSqlLedgerDependency(definition.body))
        .map((definition) => definition.name)
    );
    for (const definition of definitions.filter((candidate) => objectNames.has(candidate.name))) {
      const path = definition.file;
      actual[path] = (actual[path] ?? 0) + 1;
      const analysis = sqlHoursAnalysis(definition.body, definition.file);
      if (analysis.unsupported.length > 0) {
        (unsupported[path] ??= []).push(definition.name);
      }
      expect(SQL_LEDGER_OBJECTS[path]?.some((entry) =>
        entry.startsWith(`${definition.name}:`) &&
        entry.endsWith(directNames.has(definition.name) ? '/direct' : '/transitive')
      ), `${path}:${definition.name}`).toBe(true);
    }
    expectExactCounts(actual, SQL_LEDGER_OBJECTS);
    expect(unsupported).toEqual(SQL_UNSUPPORTED_OBJECTS);
  });

  it('classifies every production RPC/view call into the discovered SQL dependency graph', () => {
    const actual: Record<string, number> = {};
    for (const path of productionSourceFiles()) {
      const calls = indirectCalls(readFileSync(path, 'utf8'), objectNames, path);
      if (calls.length === 0) continue;
      const relativePath = relative(ROOT, path);
      actual[relativePath] = calls.length;
      expect(calls).toEqual(
        INDIRECT_TS_CONSUMERS[relativePath]?.map((entry) => entry.split(':')[0])
      );
    }
    expectExactCounts(actual, INDIRECT_TS_CONSUMERS);
    expect(Object.values(actual).reduce((sum, count) => sum + count, 0)).toBe(10);
    expect(productionSourceFiles().flatMap((path) =>
      discoverSupabaseCalls(readFileSync(path, 'utf8'), path)
        .filter((call) => call.method === 'rpc' &&
          (call.target === 'exec_sql' || call.targets?.includes('exec_sql')))
    )).toEqual([]);
  });

  it('discovers active raw-hours SQL under arbitrary aliases, excluding comments', () => {
    const actual: Record<string, number> = {};
    const unsupported: Record<string, string[]> = {};
    for (const path of migrationFiles) {
      const relativePath = relative(ROOT, path);
      const analysis = sqlHoursAnalysis(readFileSync(path, 'utf8'), relativePath);
      if (analysis.count > 0) actual[relativePath] = analysis.count;
      if (analysis.unsupported.length > 0) unsupported[relativePath] = analysis.unsupported;
    }
    expectExactCounts(actual, SQL_DIRECT_HOURS_USES);
    expectExactCounts(Object.fromEntries(Object.entries(unsupported)
      .map(([path, entries]) => [path, entries.length])), SQL_UNSUPPORTED_EXECUTES);
  });

  it('mutation probes bite on all supported TS forms, SQL aliases, and dependency edges', () => {
    expect(directTableTouchCount("client.from ( 'contract_hours_ledger' ).select('*')")).toBe(1);

    const syntaxForms = `
      const TABLE = 'contract_hours_ledger';
      const RPC = 'get_bucket_summary';
      const METHOD = 'from';
      client.from(TABLE);
      client[METHOD]('contract_hours_ledger');
      client['from']<LedgerRow>('contract_hours_ledger');
      const { from: readTable, rpc } = client;
      readTable('contract_hours_ledger');
      rpc(RPC);
    `;
    const discovered = discoverSupabaseCalls(syntaxForms);
    expect(discovered.filter((call) => call.target === 'contract_hours_ledger')).toHaveLength(4);
    expect(discovered.some((call) => call.target === 'get_bucket_summary')).toBe(true);
    expect(discovered.filter((call) => call.unsupported)).toEqual([]);
    expect(discoverSupabaseCalls('s[method](target)')[0]).toMatchObject({
      method: 'unknown', unsupported: 'dynamic callable name', expression: 'method',
    });
    expect(discoverSupabaseCalls('s.from(target)')[0]).toMatchObject({
      method: 'from', unsupported: 'dynamic target', expression: 'target',
    });
    expect(directTableTouchCount("const target = 'contract_hours_ledger'; s.from(target)")).toBe(1);
    expect(directTableTouchCount(
      "const method = 'from'; const target = 'contract_hours_ledger'; s[method](target)"
    )).toBe(1);
    expect(directTableTouchCount(
      "const {'from': readTable} = s; readTable('contract_hours_ledger')"
    )).toBe(1);
    expect(directTableTouchCount(
      "const METHOD = 'from'; const {[METHOD]: read} = s; read('contract_hours_ledger')"
    )).toBe(1);
    expect(directTableTouchCount(
      "const read = s.from; read<Ledger>('contract_hours_ledger')"
    )).toBe(1);
    expect(directTableTouchCount(
      "const METHOD = 'from'; const read = s[METHOD]; read('contract_hours_ledger')"
    )).toBe(1);
    expect(indirectCalls(
      "const METHOD = 'rpc'; const {[METHOD]: call} = s; call<Row>('get_bucket_summary')",
      objectNames
    )).toEqual(['get_bucket_summary']);
    expect(discoverSupabaseCalls(
      "const {[externalMethod]: call} = s; call('contract_hours_ledger')"
    )).toContainEqual(expect.objectContaining({
      method: 'unknown', unsupported: 'dynamic callable name', expression: 'call',
    }));

    expect(directTableTouchCount(`
      const holder = { read: client.from };
      const alias = holder.read;
      alias<Ledger>('contract_hours_ledger');
    `)).toBe(1);
    expect(indirectCalls(`
      const holder = { call: client['rpc'] };
      holder.call('get_bucket_summary');
    `, objectNames)).toEqual(['get_bucket_summary']);
    expect(directTableTouchCount(`
      function invoke(read) { read('contract_hours_ledger'); }
      invoke(client.from);
    `)).toBe(1);
    expect(discoverSupabaseCalls(`
      function invoke(read) { read('contract_hours_ledger'); }
      invoke(externalCallable);
    `)).toContainEqual(expect.objectContaining({
      method: 'unknown', unsupported: 'dynamic callable name', expression: 'read',
    }));
    expect(directTableTouchCount(`
      const read = flag ? client.from : client.rpc;
      read('contract_hours_ledger');
    `)).toBe(1);
    expect(directTableTouchCount(`
      let read;
      ({ from: read } = client);
      read('contract_hours_ledger');
    `)).toBe(1);

    const nestedAliases = `
      const METHOD = 'from';
      const read = client[METHOD];
      { const read = external; read('contract_hours_ledger'); }
      read('contract_hours_ledger');
    `;
    expect(directTableTouchCount(nestedAliases)).toBe(1);
    expect(discoverSupabaseCalls(nestedAliases)
      .filter((call) => call.target === 'contract_hours_ledger')).toHaveLength(1);

    const shadowed = discoverSupabaseCalls(`
      const TABLE = 'contract_hours_ledger';
      { const TABLE = target; s.from(TABLE); }
    `);
    expect(shadowed).toContainEqual({
      method: 'from', unsupported: 'dynamic target', expression: 'TABLE',
    });

    const multilineRpc = `
      const { data, error } = await client
        .rpc(
          'get_bucket_summary',
          { p_contrato_id: id }
        );`;
    expect(indirectCalls(multilineRpc, objectNames)).toEqual(['get_bucket_summary']);

    const alternateAlias = `
      SELECT ledger_rows.hours
      FROM public.contract_hours_ledger AS ledger_rows;`;
    expect(sqlDirectHoursUseCount(alternateAlias)).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT contract_hours_ledger.hours FROM public.contract_hours_ledger;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT hours FROM public.contract_hours_ledger;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT "hours" FROM "public"."contract_hours_ledger";'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT "ledger rows"."hours" FROM "public"."contract_hours_ledger" AS "ledger rows";'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(`
      WITH ledger_rows AS (
        SELECT * FROM public.contract_hours_ledger
      )
      SELECT hours FROM ledger_rows;
    `)).toBe(2);
    expect(sqlDirectHoursUseCount(
      'SELECT q.hours FROM (SELECT * FROM public.contract_hours_ledger) q;'
    )).toBe(2);
    expect(sqlDirectHoursUseCount(
      'SELECT outer_q.hours FROM (SELECT q.* FROM (SELECT * FROM public.contract_hours_ledger) q) outer_q;'
    )).toBe(3);
    expect(sqlDirectHoursUseCount(
      'SELECT * FROM public.contract_hours_ledger;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT l.* FROM public.contract_hours_ledger AS l;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT (SELECT l.hours) FROM public.contract_hours_ledger AS l;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT (SELECT l.*) FROM public.contract_hours_ledger AS l;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT (SELECT l.hours FROM safe_rows AS l) FROM public.contract_hours_ledger AS l;'
    )).toBe(0);
    expect(sqlDirectHoursUseCount(
      'UPDATE public.contract_hours_ledger SET "hours" = 1;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'UPDATE public.contract_hours_ledger AS l SET ("hours", status) = (1, \'reservada\');'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      "UPDATE public.contract_hours_ledger SET status = 'consumida' RETURNING *;"
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'DELETE FROM public.contract_hours_ledger WHERE false RETURNING contract_hours_ledger.*;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'INSERT INTO public.contract_hours_ledger (hours) VALUES (1) RETURNING *;'
    )).toBe(2);
    expect(sqlDirectHoursUseCount(
      "SELECT 'contract_hours_ledger.hours' AS note; -- SELECT hours FROM contract_hours_ledger\n"
    )).toBe(0);
    expect(() => sqlDirectHoursUseCount(
      'MERGE INTO contract_hours_ledger USING incoming ON true WHEN MATCHED THEN UPDATE SET hours = 1;'
    )).toThrow(/MERGE/);
    expect(() => sqlDirectHoursUseCount(
      'MERGE INTO safe_target USING contract_hours_ledger AS source ON true WHEN NOT MATCHED THEN DO NOTHING;'
    )).toThrow(/MERGE/);
    const unsupportedFunction = sqlObjectDefinitions(`
      CREATE FUNCTION public.synthetic_ledger_merge() RETURNS void
      LANGUAGE sql AS $body$
        MERGE INTO contract_hours_ledger USING incoming ON true
        WHEN MATCHED THEN UPDATE SET hours = 1
      $body$;
    `, 'synthetic.sql')[0];
    expect(() => sqlDirectHoursUseCount(unsupportedFunction.body))
      .toThrow(/MERGE/);
    expect(sqlDirectHoursUseCount(
      'SELECT l.status FROM contract_hours_ledger l; SELECT q.hours FROM (SELECT * FROM contract_hours_ledger) q;'
    )).toBe(2);
    expect(sqlDirectHoursUseCount(
      "SELECT '$$ SELECT * FROM contract_hours_ledger $$'::text; /* SELECT l.* FROM contract_hours_ledger l */"
    )).toBe(0);

    const syntheticSql = `
      CREATE VIEW public.synthetic_ledger_view AS
        SELECT ledger_rows.hours FROM public.contract_hours_ledger ledger_rows;
      CREATE FUNCTION public.synthetic_ledger_function() RETURNS SETOF numeric
      LANGUAGE sql AS $body$
        SELECT hours FROM public.synthetic_ledger_view
      $body$;`;
    const syntheticDefinitions = sqlObjectDefinitions(syntheticSql, 'synthetic.sql');
    const syntheticTargets = ledgerObjectNames(syntheticDefinitions);
    expect([...syntheticTargets].sort()).toEqual([
      'synthetic_ledger_function',
      'synthetic_ledger_view',
    ]);
    expect(indirectCalls("client.from('synthetic_ledger_view')", syntheticTargets)).toEqual([
      'synthetic_ledger_view',
    ]);
    expect(sqlDirectHoursUseCount(`
      CREATE VIEW public.synthetic_ledger_view AS
        SELECT * FROM public.contract_hours_ledger;
      CREATE FUNCTION public.synthetic_ledger_function() RETURNS SETOF numeric
      LANGUAGE sql AS $body$
        SELECT hours FROM public.synthetic_ledger_view
      $body$;
    `)).toBe(2);

    // These representative mutations are detected but intentionally absent from
    // the production classifications: the same exact-count assertions above would
    // therefore go red if any were inserted into a production root/migration.
    expect(DIRECT_TS_TOUCHES['components/synthetic.tsx']).toBeUndefined();
    expect(INDIRECT_TS_CONSUMERS['pages/synthetic.ts']).toBeUndefined();
    expect(SQL_DIRECT_HOURS_USES['supabase/migrations/synthetic.sql']).toBeUndefined();
    expect(SQL_LEDGER_OBJECTS['supabase/migrations/synthetic.sql']).toBeUndefined();
  });

  it('traces finite dynamic values through live bindings and every resolved branch', () => {
    const liveValues = (source: string): string[] => discoverSupabaseCalls(source)
      .flatMap((call) => call.dynamicValues ?? []);

    expect(liveValues(`
      const oldTables = ['safe_a', 'safe_b'];
      const tables = process.argv.slice(2);
      for (const t of tables) client.from(t);
    `)).toEqual([]);
    expect(discoverSupabaseCalls(`
      const oldTables = ['safe_a', 'safe_b'];
      const tables = process.argv.slice(2);
      for (const t of tables) client.from(t);
    `)).toContainEqual(expect.objectContaining({
      method: 'from', unsupported: 'dynamic target', expression: 't',
    }));

    const branches = discoverSupabaseCalls(`
      const tables = flag ? ['safe_a', 'contract_hours_ledger'] : ['safe_b'];
      for (const t of tables) client.from(t);
    `);
    expect(branches[0].dynamicValues).toEqual([
      'contract_hours_ledger', 'safe_a', 'safe_b',
    ]);
    expect(directTableTouchCount(`
      const tables = flag ? ['safe_a', 'contract_hours_ledger'] : ['safe_b'];
      for (const t of tables) client.from(t);
    `)).toBe(1);

    expect(discoverSupabaseCalls(`
      let tables = ['safe_a'];
      tables = process.argv;
      for (const t of tables) client.from(t);
    `)).toContainEqual(expect.objectContaining({ unsupported: 'dynamic target' }));
    expect(discoverSupabaseCalls(`
      function read(table) { client.from(table); }
      read('safe_a');
    `)).toContainEqual(expect.objectContaining({ unsupported: 'dynamic target' }));
    expect(discoverSupabaseCalls(`
      const tables = ['safe_a'];
      { const tables = process.argv; for (const t of tables) client.from(t); }
    `)).toContainEqual(expect.objectContaining({ unsupported: 'dynamic target' }));
    const objectMutation = discoverSupabaseCalls(`
      const targets = { table: 'safe_a' };
      targets.table = 'contract_hours_ledger';
      client.from(targets.table);
    `);
    expect(objectMutation).toEqual([{ method: 'from', target: 'contract_hours_ledger' }]);
    expect(directTableTouchCount(`
      const targets = { table: 'safe_a' };
      targets.table = 'contract_hours_ledger';
      client.from(targets.table);
    `)).toBe(1);
    expect(directTableTouchCount(`
      const targets = ['safe_a'];
      targets.push('contract_hours_ledger');
      for (const target of targets) client.from(target);
    `)).toBe(1);
    expect(discoverSupabaseCalls(`
      const targets = ['safe_a'];
      targets.push(process.argv[2]);
      for (const target of targets) client.from(target);
    `)).toContainEqual(expect.objectContaining({ unsupported: 'dynamic target' }));
    expect(indirectCalls(`
      const names = ['safe_rpc', 'get_bucket_summary'];
      for (const name of names) client.rpc(name);
    `, objectNames)).toEqual(['get_bucket_summary']);

    for (const [key, allowance] of Object.entries(DYNAMIC_NON_LEDGER_CALLS)) {
      const path = key.slice(0, key.indexOf(':'));
      const source = readFileSync(join(ROOT, path), 'utf8');
      const calls = discoverSupabaseCalls(source, path)
        .filter((call) => call.dynamicKind && dynamicCallKey(path, call) === key);
      expect(calls, key).toHaveLength(1);
      expect(calls[0].dynamicValues, allowance.justification)
        .toEqual([...allowance.allowedValues].sort());
    }
  });

  it('converges recursive calls and propagates spread, rest, defaults, and mutations', () => {
    const directRecursive = discoverSupabaseCalls(`
      function read(depth, table = 'safe_table') {
        if (depth) read(0, 'contract_hours_ledger');
        client.from(table);
      }
      read(1);
    `);
    expect(directRecursive.some((call) =>
      call.target === 'contract_hours_ledger' ||
      call.targets?.includes('contract_hours_ledger'))).toBe(true);

    expect(directTableTouchCount(`
      first();
      function first(table = 'safe_table') { second('contract_hours_ledger'); }
      function second(table) { if (flag) first(table); client.from(table); }
    `)).toBeGreaterThan(0);

    expect(directTableTouchCount(`
      function invoke(table) { client.from(table); }
      const args = ['contract_hours_ledger'];
      invoke(...args);
    `)).toBeGreaterThan(0);
    expect(directTableTouchCount(`
      function invoke(...tables) { for (const table of tables) client.from(table); }
      invoke('safe_table', 'contract_hours_ledger');
    `)).toBeGreaterThan(0);
    expect(directTableTouchCount(`
      function invoke(table = 'contract_hours_ledger') { client.from(table); }
      invoke();
    `)).toBeGreaterThan(0);

    expect(directTableTouchCount(`
      const holder = { read: externalCallable };
      Object.assign(holder, { read: client.from });
      holder.read('contract_hours_ledger');
    `)).toBe(1);
    expect(directTableTouchCount(`
      const targets = ['safe_table'];
      targets.splice(0, 1, 'contract_hours_ledger');
      for (const target of targets) client.from(target);
    `)).toBe(1);

    expect(discoverSupabaseCalls(`
      const targets = ['safe_table'];
      targets.unshift(process.argv[2]);
      for (const target of targets) client.from(target);
    `)).toContainEqual(expect.objectContaining({
      method: 'from', unsupported: 'dynamic target', expression: 'target',
    }));
    expect(discoverSupabaseCalls(`
      const holder = { read: client.from };
      Object.defineProperty(holder, 'read', { value: externalCallable });
      holder.read('safe_table');
    `)).toContainEqual(expect.objectContaining({
      method: 'unknown', unsupported: 'dynamic callable name', expression: 'holder.read',
    }));

    const deterministicSource = `
      function recurse(value = 'safe_table') {
        if (flag) recurse('contract_hours_ledger');
        client.from(value);
      }
      recurse();
    `;
    expect(discoverSupabaseCalls(deterministicSource))
      .toEqual(discoverSupabaseCalls(deterministicSource));
    expect(discoverSupabaseCalls(deterministicSource).length).toBeLessThan(10);
  });

  it('classifies Function adapters, bound methods, and higher-order callable returns', () => {
    expect(directTableTouchCount(
      "client.from.call(client, 'contract_hours_ledger')"
    )).toBe(1);
    expect(directTableTouchCount(`
      const invoke = client.from.call;
      invoke(client, 'contract_hours_ledger');
    `)).toBe(1);
    expect(directTableTouchCount(
      "client.from.apply(client, ['contract_hours_ledger'])"
    )).toBe(1);
    expect(directTableTouchCount(`
      const args = ['contract_hours_ledger'];
      const apply = client.from.apply;
      apply(client, args);
    `)).toBe(1);
    expect(directTableTouchCount(
      "Reflect.apply(client.from, client, ['contract_hours_ledger'])"
    )).toBe(1);
    expect(directTableTouchCount(`
      const reflect = Reflect.apply;
      reflect(client.from, client, ['contract_hours_ledger']);
    `)).toBe(1);
    expect(directTableTouchCount(`
      const reflection = Reflect;
      reflection.apply(client.from, client, ['contract_hours_ledger']);
    `)).toBe(1);
    expect(directTableTouchCount(`
      const operation = 'apply';
      Reflect[operation](client.from, client, ['contract_hours_ledger']);
    `)).toBe(1);
    expect(directTableTouchCount(`
      const { ['apply']: invoke } = Reflect;
      invoke(client.from, client, ['contract_hours_ledger']);
    `)).toBe(1);
    expect(directTableTouchCount(
      "Function.prototype.call.call(client.from, client, 'contract_hours_ledger')"
    )).toBe(1);

    expect(directTableTouchCount(`
      const read = client.from.bind(client);
      read('contract_hours_ledger');
    `)).toBe(1);
    expect(directTableTouchCount(`
      const read = client.from.bind(client, 'contract_hours_ledger');
      read();
    `)).toBe(1);

    expect(directTableTouchCount(`
      function invoke(callable, ...args) { return callable(...args); }
      invoke(client.from, 'contract_hours_ledger');
    `)).toBeGreaterThan(0);
    expect(directTableTouchCount(`
      function adapter(callable) {
        return (...args) => callable.apply(client, args);
      }
      const read = adapter(client.from);
      read('contract_hours_ledger');
    `)).toBeGreaterThan(0);
    expect(directTableTouchCount(`
      function recursive(callable, args, depth = 1) {
        if (depth) return recursive(callable, args, 0);
        return Reflect.apply(callable, client, args);
      }
      recursive(client.from, ['contract_hours_ledger']);
    `)).toBeGreaterThan(0);
    expect(directTableTouchCount(`
      const identity = callable => callable;
      identity(client.from)('contract_hours_ledger');
    `)).toBe(1);
    expect(directTableTouchCount(`
      const wrap = callable => target => callable(target);
      wrap(client.from)('contract_hours_ledger');
    `)).toBeGreaterThan(0);
    expect(directTableTouchCount(`
      ['contract_hours_ledger'].forEach(client.from.bind(client));
    `)).toBe(1);
    expect(directTableTouchCount(`
      const helper = { identity(callable) { return callable; } };
      helper.identity(client.from)('contract_hours_ledger');
    `)).toBe(1);
    expect(directTableTouchCount(`
      class Helper { identity(callable) { return callable; } }
      new Helper().identity(client.from)('contract_hours_ledger');
    `)).toBe(1);

    for (const source of [
      "client.from.apply(client, process.argv)",
      "Reflect.apply(externalCallable, client, ['contract_hours_ledger'])",
      "const read = externalCallable.bind(client); read('contract_hours_ledger')",
      "function invoke(callable) { callable('contract_hours_ledger'); } invoke(externalCallable)",
      "opaqueHigherOrder(client.from)",
      "const reflection = externalReflect; reflection.apply(client.from, client, ['safe_table'])",
    ]) {
      expect(discoverSupabaseCalls(source)).toContainEqual(expect.objectContaining({
        unsupported: expect.any(String),
      }));
    }

    expect(discoverSupabaseCalls(`
      function ordinary(value) { return value; }
      ordinary.call(null, 'contract_hours_ledger');
      Math.max.apply(null, [1, 2]);
    `).filter((call) => call.method !== 'unknown' || call.unsupported)).toEqual([]);

    const cyclic = `
      const holder = {};
      holder.self = holder;
      holder.read = client.from;
      holder.self.read('contract_hours_ledger');
    `;
    expect(discoverSupabaseCalls(cyclic)).toEqual(discoverSupabaseCalls(cyclic));
    expect(directTableTouchCount(cyclic)).toBe(1);
  });

  it('composes Function.prototype call, apply, and bind with exact intrinsic semantics', () => {
    const expectOneLedgerCall = (source: string): void => {
      const discovered = discoverSupabaseCalls(source);
      expect(discovered.filter((call) => call.method === 'from' &&
        (call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger'))), source).toHaveLength(1);
      expect(discovered.filter((call) => call.unsupported), source).toEqual([]);
    };

    for (const source of [
      `Function.prototype.apply.call(
         client.from, client, ['contract_hours_ledger']
       );`,
      `Function.prototype.call.apply(
         client.from, [client, 'contract_hours_ledger']
       );`,
      `const apply = Function.prototype.apply;
       apply.call(client.from, client, ['contract_hours_ledger']);`,
      `const call = Function.prototype.call;
       call.apply(client.from, [client, 'contract_hours_ledger']);`,
      `Function['prototype']['apply']['call'](
         client['from'], client, ['contract_hours_ledger']
       );`,
      `const proto = Function['prototype'];
       const operation = 'apply';
       proto[operation].call(client.from, client, ['contract_hours_ledger']);`,
      `const { apply: invoke } = Function.prototype;
       invoke.call(client.from, client, ['contract_hours_ledger']);`,
      `const { ['call']: invoke } = Function['prototype'];
       invoke.apply(client.from, [client, 'contract_hours_ledger']);`,
      `Function.prototype.bind.call(
         client.from, client, 'contract_hours_ledger'
       )();`,
      `Function.prototype.bind.apply(
         client.from, [client, 'contract_hours_ledger']
       )();`,
      `const bind = Function.prototype.bind;
       bind.call(client.from, client, 'contract_hours_ledger')();`,
      `Function.prototype.call.bind(
         client.from, client
       )('contract_hours_ledger');`,
      `Function.prototype.call.call(
         Function.prototype.apply,
         client.from, client, ['contract_hours_ledger']
       );`,
      `Function.prototype.apply.apply(
         Function.prototype.call,
         [client.from, [client, 'contract_hours_ledger']]
       );`,
    ]) expectOneLedgerCall(source);

    for (const source of [
      `Function.prototype.apply.call(
         externalCallable, client, ['contract_hours_ledger']
       );`,
      `const external = externalAdapter;
       external.call(null, client.from, 'contract_hours_ledger');`,
      `const method = process.argv[2];
       Function.prototype[method].call(
         client.from, client, 'contract_hours_ledger'
       );`,
    ]) {
      expect(discoverSupabaseCalls(source), source).toContainEqual(expect.objectContaining({
        method: 'unknown', unsupported: 'dynamic callable name',
      }));
    }

    for (const source of [
      `Function.prototype.apply.call(Math.max, null, [1, 2]);`,
      `const ordinary = { from(value) { return value; } };
       Function.prototype.call.call(ordinary.from, ordinary, 'contract_hours_ledger');`,
      `Array.from.call(Array, ['contract_hours_ledger']);`,
    ]) {
      expect(directTableTouchCount(source), source).toBe(0);
      expect(discoverSupabaseCalls(source).filter((call) => call.unsupported), source).toEqual([]);
    }

    const cyclic = `
      const adapters = {};
      adapters.self = adapters;
      adapters.invoke = Function.prototype.call;
      adapters.self.invoke.call(
        client.from, client, 'contract_hours_ledger'
      );
    `;
    expect(discoverSupabaseCalls(cyclic)).toEqual(discoverSupabaseCalls(cyclic));
    expectOneLedgerCall(cyclic);
  });

  it('preserves positional values through declarations, assignments, parameters, and returns', () => {
    const expectOneLedgerCall = (source: string): void => {
      const discovered = discoverSupabaseCalls(source);
      expect(discovered.filter((call) => call.method === 'from' &&
        (call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger'))), source).toHaveLength(1);
      expect(discovered.filter((call) => call.unsupported), source).toEqual([]);
    };

    for (const source of [
      `const [read, receiver, table] =
         [client.from, client, 'contract_hours_ledger'];
       read.call(receiver, table);`,
      `function invoke([fn, receiver, args]) {
         Reflect.apply(fn, receiver, args);
       }
       invoke([client.from, client, ['contract_hours_ledger']]);`,
      `let read, receiver, table;
       [read, receiver, table] =
         [client.from, client, 'contract_hours_ledger'];
       read.call(receiver, table);`,
      `function parts() {
         return [client.from, client, ['contract_hours_ledger']];
       }
       const [fn, receiver, args] = parts();
       Reflect.apply(fn, receiver, args);`,
      `const { nested: [fn, receiver, { args: [table] }] } = {
         nested: [client.from, client, { args: ['contract_hours_ledger'] }]
       };
       fn.call(receiver, table);`,
      `const [, read = externalCallable, receiver, , table = 'safe_table'] =
         [0, client.from, client, 0, 'contract_hours_ledger'];
       read.call(receiver, table);`,
      `const original = [client.from, client, 'contract_hours_ledger'];
       const [read, ...rest] = [...original];
       read.call(rest[0], rest[1]);`,
      `const method = 'from';
       const operation = 'apply';
       const [read, invoke, receiver, args] =
         [client[method], Reflect[operation], client, ['contract_hours_ledger']];
       invoke(read, receiver, args);`,
      `let read, receiver, args;
       ({ nested: [read, receiver, args] } = {
         nested: [client.from, client, ['contract_hours_ledger']]
       });
       Reflect.apply(read, receiver, args);`,
      `function wrap(value) { return { value: [value] }; }
       const { value: [[read, receiver, table]] } =
         wrap([client.from, client, 'contract_hours_ledger']);
       read.call(receiver, table);`,
    ]) expectOneLedgerCall(source);

    for (const source of [
      `const [read, receiver] = process.argv;
       read.call(receiver, 'contract_hours_ledger');`,
      `function invoke([read, receiver, args]) {
         Reflect.apply(read, receiver, args);
       }
       invoke(externalTuple);`,
      `const tuple = flag
         ? [client.from, client, ['contract_hours_ledger']]
         : externalTuple;
       const [read, receiver, args] = tuple;
       Reflect.apply(read, receiver, args);`,
    ]) {
      expect(discoverSupabaseCalls(source), source).toContainEqual(expect.objectContaining({
        method: 'unknown', unsupported: 'dynamic callable name',
      }));
    }

    for (const source of [
      `function ordinary(value) { return value; }
       const [read, receiver, table] = [ordinary, null, 'contract_hours_ledger'];
       read.call(receiver, table);`,
      `const tuple = [{ from(value) { return value; } }, 'contract_hours_ledger'];
       const [ordinary, table] = tuple;
       ordinary.from(table);`,
      `const [, value = 'contract_hours_ledger'] = [0, 'safe_table'];
       String(value);`,
    ]) {
      expect(directTableTouchCount(source), source).toBe(0);
      expect(discoverSupabaseCalls(source).filter((call) => call.unsupported), source).toEqual([]);
    }

    const cyclic = `
      const tuple = [client.from, client, 'contract_hours_ledger'];
      tuple.push(tuple);
      const [read, receiver, table] = tuple;
      read.call(receiver, table);
    `;
    expect(discoverSupabaseCalls(cyclic)).toEqual(discoverSupabaseCalls(cyclic));
    expectOneLedgerCall(cyclic);
  });

  it('distinguishes finite intrinsic reuse from recursive adapter states', () => {
    const expectOneLedgerCall = (source: string): void => {
      const discovered = discoverSupabaseCalls(source);
      expect(discovered.filter((call) => call.method === 'from' &&
        (call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger'))), source).toHaveLength(1);
      expect(discovered.filter((call) => call.unsupported), source).toEqual([]);
    };

    for (const source of [
      `const c = Function.prototype.call;
       c.call(
         c,
         Function.prototype.apply,
         client.from,
         client,
         ['contract_hours_ledger'],
       );`,
      `const c = Function.prototype.call;
       c.call(
         c,
         c,
         Function.prototype.apply,
         client.from,
         client,
         ['contract_hours_ledger'],
       );`,
      `const key = 'call';
       const { call: c } = Function.prototype;
       c[key](c, Function.prototype.apply, client.from, client,
         ['contract_hours_ledger']);`,
      `const c = Function.prototype.call;
       const invoke = c.call.bind(c);
       invoke(Function.prototype.apply, client.from, client,
         ['contract_hours_ledger']);`,
    ]) expectOneLedgerCall(source);

    const duplicateBranches = `
      const c = Function.prototype.call;
      const invoke = flag ? c.call : c['call'];
      invoke(c, Function.prototype.apply, client.from, client,
        ['contract_hours_ledger']);
    `;
    expectOneLedgerCall(duplicateBranches);

    const recursive = `
      function recurse(adapter) { return recurse(adapter); }
      const invoke = recurse(Function.prototype.call);
      invoke(client.from, client, 'contract_hours_ledger');
    `;
    const first = discoverSupabaseCalls(recursive);
    const second = discoverSupabaseCalls(recursive);
    expect(first).toEqual(second);
    expect(first).toContainEqual(expect.objectContaining({
      method: 'unknown', unsupported: 'dynamic callable name',
    }));
    expect(first.length).toBeLessThan(10);
  });

  it('retains import provenance for inert, database, and ambiguous receivers', () => {
    for (const source of [
      `import { Readable } from 'node:stream';
       Readable.from('contract_hours_ledger');`,
      `import { Readable as R } from 'node:stream';
       const Alias = R;
       Alias['from']('contract_hours_ledger');`,
      `import * as stream from 'node:stream';
       stream.Readable.from('contract_hours_ledger');`,
      `import stream from 'node:stream';
       stream.Readable['from']('contract_hours_ledger');`,
      `import * as stream from 'node:stream';
       const { Readable } = stream;
       const { ['from']: make } = Readable;
       make('contract_hours_ledger');`,
      `import { Buffer as ImportedBuffer } from 'node:buffer';
       const { from: make } = ImportedBuffer;
       make('contract_hours_ledger');`,
    ]) {
      expect(directTableTouchCount(source), source).toBe(0);
      expect(discoverSupabaseCalls(source).filter((call) => call.unsupported), source).toEqual([]);
    }

    for (const source of [
      `import { createClient } from '@supabase/supabase-js';
       const database = createClient(url, key);
       database.from('contract_hours_ledger');`,
      `import database from '@supabase/supabase-js';
       const read = database['from'];
       read('contract_hours_ledger');`,
    ]) expect(directTableTouchCount(source), source).toBe(1);
    expect(discoverSupabaseCalls(`
      import { createServiceRoleClient } from '../../lib/api-auth';
      const database = createServiceRoleClient();
      database.from('contract_hours_ledger');
    `, join(ROOT, 'pages/api/synthetic.ts')).filter((call) =>
      call.method === 'from' && call.target === 'contract_hours_ledger')).toHaveLength(1);

    for (const source of [
      `import api from 'external-api';
       api.from('contract_hours_ledger');`,
      `import * as api from 'external-api';
       const read = api['from'];
       read('contract_hours_ledger');`,
      `import { client as api } from 'external-api';
       const { from: read } = api;
       read('contract_hours_ledger');`,
    ]) {
      const discovered = discoverSupabaseCalls(source);
      expect(directTableTouchCount(source), source).toBe(0);
      expect(discovered, source).toContainEqual(expect.objectContaining({
        method: 'unknown', unsupported: 'dynamic callable name',
      }));
    }

    const localOrdinary = `
      const ordinary = { from(value) { return value; } };
      ordinary.from('contract_hours_ledger');
    `;
    expect(directTableTouchCount(localOrdinary)).toBe(0);
    expect(discoverSupabaseCalls(localOrdinary)
      .filter((call) => call.unsupported)).toEqual([]);
  });

  it('preserves executable positions through finite sequence construction and mutation', () => {
    const expectOneLedgerCall = (source: string): void => {
      const discovered = discoverSupabaseCalls(source);
      expect(discovered.filter((call) => call.method === 'from' &&
        (call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger'))), source).toHaveLength(1);
      expect(discovered.filter((call) => call.unsupported), source).toEqual([]);
    };

    for (const source of [
      `const [fn, receiver, table] =
         Array.of(client.from, client, 'contract_hours_ledger');
       fn.call(receiver, table);`,
      `const [fn, receiver, table] =
         new Array(client.from, client, 'contract_hours_ledger');
       fn.call(receiver, table);`,
      `const [fn, receiver, table] =
         Array.from([client.from, client, 'contract_hours_ledger']);
       fn.call(receiver, table);`,
      `const slots = [];
       [slots[0], slots[1], slots[2]] =
         [client.from, client, 'contract_hours_ledger'];
       slots[0].call(slots[1], slots[2]);`,
      `const { of: make } = Array;
       const key = 0;
       const slots = make(client.from, client, 'contract_hours_ledger');
       const read = slots[key];
       read.call(slots[1], slots[2]);`,
      `const construct = Array;
       const slots = new construct(...[client.from, client, 'contract_hours_ledger']);
       slots['0'].call(slots[1], slots[2]);`,
      `const method = 'from';
       const make = Array[method];
       const slots = make([client.from, client, 'contract_hours_ledger'], value => value);
       slots[0].call(slots[1], slots[2]);`,
      `const head = Array.of(client.from);
       const slots = head.concat([client], Array.of('contract_hours_ledger'));
       slots[0].call(slots[1], slots[2]);`,
      `function parts(factory = Array.of) {
         return factory(client.from, client, 'contract_hours_ledger');
       }
       const invoke = () => parts();
       const [fn, receiver, table] = flag ? invoke() : [...invoke()];
       fn.call(receiver, table);`,
      `const slots = new Array(3);
       const index = 0;
       ({ fn: slots[index], nested: [slots[1], slots[2]] } = {
         fn: client.from,
         nested: [client, 'contract_hours_ledger'],
       });
       slots[index].call(slots[1], slots[2]);`,
      `function invoke([fn, receiver, table, ...rest]) {
         fn.call(receiver, table);
       }
       const slots = Array.of(0, client.from, client, 'contract_hours_ledger');
       const [, ...tail] = slots;
       invoke(tail);`,
    ]) expectOneLedgerCall(source);

    for (const source of [
      `const slots = Array.from(externalSequence);
       slots[0].call(slots[1], 'contract_hours_ledger');`,
      `const slots = Array.from([client.from], externalMapper);
       slots[0](client, 'contract_hours_ledger');`,
      `const make = externalFactory;
       const slots = make(client.from, client, 'contract_hours_ledger');
       slots[0].call(slots[1], slots[2]);`,
    ]) {
      expect(discoverSupabaseCalls(source), source).toContainEqual(expect.objectContaining({
        method: 'unknown', unsupported: 'dynamic callable name',
      }));
    }

    for (const source of [
      `function ordinary(value) { return value; }
       const holes = new Array(3);
       const [first = ordinary, second = ordinary] = holes;
       first.call(null, 'contract_hours_ledger');`,
      `function ordinary(value) { return value; }
       const slots = Array.of(ordinary, null, 'contract_hours_ledger');
       slots[0].call(slots[1], slots[2]);`,
      `const slots = Array.from(['contract_hours_ledger']);
       const value = slots[0];`,
    ]) {
      expect(directTableTouchCount(source), source).toBe(0);
      expect(discoverSupabaseCalls(source).filter((call) => call.unsupported), source).toEqual([]);
    }

    const cyclic = `
      const slots = Array.of(client.from, client, 'contract_hours_ledger');
      slots.push(slots);
      slots[0].call(slots[1], slots[2]);
    `;
    expect(discoverSupabaseCalls(cyclic)).toEqual(discoverSupabaseCalls(cyclic));
    expectOneLedgerCall(cyclic);
  });

  it('resolves ESM and CommonJS provenance through re-export graphs', () => {
    for (const source of [
      `const { Readable } = require('node:stream');
       Readable.from('contract_hours_ledger');`,
      `const stream = require('node:stream');
       const R = stream['Readable'];
       R.from('contract_hours_ledger');`,
      `const stream = require('node:stream').default;
       const { ['Readable']: R } = stream;
       R['from']('contract_hours_ledger');`,
      `const make = require('node:buffer').Buffer.from;
       make('contract_hours_ledger');`,
    ]) {
      expect(directTableTouchCount(source), source).toBe(0);
      expect(discoverSupabaseCalls(source).filter((call) => call.unsupported), source).toEqual([]);
    }

    expect(directTableTouchCount(`
      import { useSupabaseClient } from '../lib/frontend-auth-utils';
      const database = useSupabaseClient();
      database.from('contract_hours_ledger');
    `, join(ROOT, 'pages/synthetic.ts'))).toBe(1);

    const fixtureRoot = mkdtempSync(join(ROOT, '.z7-r15-modules-'));
    try {
      writeFileSync(join(fixtureRoot, 'factory.ts'), `
        import { createClient } from '@supabase/supabase-js';
        export const makeDatabase = () => createClient('url', 'key');
        export default makeDatabase;
      `);
      writeFileSync(join(fixtureRoot, 'barrel-a.ts'), `
        export { makeDatabase as openDatabase } from './factory';
        export { default } from './factory';
      `);
      writeFileSync(join(fixtureRoot, 'barrel-b.ts'), `
        export * from './barrel-a';
      `);
      writeFileSync(join(fixtureRoot, 'common.cjs'), `
        const { createClient } = require('@supabase/supabase-js');
        exports.makeDatabase = () => createClient('url', 'key');
      `);
      writeFileSync(join(fixtureRoot, 'cycle-a.ts'), `
        export * from './cycle-b';
        export { makeDatabase } from './factory';
      `);
      writeFileSync(join(fixtureRoot, 'cycle-b.ts'), `
        export * from './cycle-a';
      `);
      const importer = join(fixtureRoot, 'consumer.ts');
      for (const source of [
        `import { openDatabase } from './barrel-a';
         openDatabase().from('contract_hours_ledger');`,
        `import databaseFactory from './barrel-a';
         const database = databaseFactory();
         database['from']('contract_hours_ledger');`,
        `import * as factories from './barrel-b';
         factories.openDatabase().from('contract_hours_ledger');`,
        `const { makeDatabase: open } = require('./common');
         open().from('contract_hours_ledger');`,
        `import { makeDatabase } from './cycle-a';
         makeDatabase().from('contract_hours_ledger');`,
      ]) expect(directTableTouchCount(source, importer), source).toBe(1);

      const circularUnknown = `
        import { missing } from './cycle-b';
        missing().from('contract_hours_ledger');
      `;
      expect(discoverSupabaseCalls(circularUnknown, importer))
        .toEqual(discoverSupabaseCalls(circularUnknown, importer));
      expect(discoverSupabaseCalls(circularUnknown, importer)).toContainEqual(
        expect.objectContaining({ method: 'unknown', unsupported: 'dynamic callable name' })
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }

    for (const source of [
      `const api = require('external-api');
       api.from('contract_hours_ledger');`,
      `const { client } = require('external-api');
       client['from']('contract_hours_ledger');`,
    ]) expect(discoverSupabaseCalls(source), source).toContainEqual(expect.objectContaining({
      method: 'unknown', unsupported: 'dynamic callable name',
    }));
  });

  it('keeps finite sequence mutations coherent across aliases and return values', () => {
    const expectOneLedgerCall = (source: string): void => {
      const discovered = discoverSupabaseCalls(source);
      expect(discovered.filter((call) => call.method === 'from' &&
        (call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger'))), source).toHaveLength(1);
      expect(discovered.filter((call) => call.unsupported), source).toEqual([]);
    };

    for (const source of [
      `const slots = [];
       slots.unshift(client.from, client, 'contract_hours_ledger');
       slots[0].call(slots[1], slots[2]);`,
      `const slots = ['contract_hours_ledger', client, client.from];
       slots.reverse()[0].call(slots[1], slots[2]);`,
      `const slots = [ordinary, client, 'contract_hours_ledger'];
       slots.fill(client.from, 0, 1);
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [ordinary, client, client.from, 'contract_hours_ledger'];
       slots.copyWithin(0, 2, 3);
       slots[0].call(slots[1], slots[3]);`,
      `const slots = [ordinary, ordinary, ordinary];
       slots.splice(-3, 3, client.from, client, 'contract_hours_ledger');
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       const fn = slots.shift();
       fn.call(slots[0], slots[1]);`,
      `const slots = [client, 'contract_hours_ledger', client.from];
       const fn = slots.pop();
       fn.call(slots[0], slots[1]);`,
      `const slots = [client, 'contract_hours_ledger'];
       slots.push(client.from);
       const fn = slots.pop();
       fn.call(slots[0], slots[1]);`,
      `const slots = [ordinary, ordinary, ordinary];
       const removed = slots.splice(0, 3, client.from, client, 'contract_hours_ledger');
       removed.unshift(client.from, client, 'contract_hours_ledger');
       removed[0].call(removed[1], removed[2]);`,
      `const slots = ['contract_hours_ledger', client, client.from];
       const same = slots;
       const reverse = same['reverse'].bind(slots);
       reverse();
       slots[0].call(same[1], same[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       const operation = 'reverse';
       const { reverse: reorder } = slots;
       slots.splice();
       reorder.call(slots);
       slots[operation]();
       slots[0].call(slots[1], slots[2]);`,
      `function reorder(value) {
         value.unshift(ordinary);
         value.shift();
         value.reverse();
         return value.reverse();
       }
       const slots = reorder([client.from, client, 'contract_hours_ledger']);
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [ordinary, client, 'contract_hours_ledger', client.from];
       slots.copyWithin(0, -1, 99);
       slots.fill(client.from, -99, -3);
       slots.splice(99, 0);
       slots[0].call(slots[1], slots[2]);`,
    ]) expectOneLedgerCall(source);

    for (const source of [
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots.sort(externalComparator);
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots.fill(client.from, externalStart);
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots.copyWithin(externalTarget, 0);
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots.splice(externalStart, 1);
       slots[0].call(slots[1], slots[2]);`,
    ]) {
      const discovered = discoverSupabaseCalls(source);
      expect(discovered, source).toContainEqual(expect.objectContaining({
        method: 'unknown', unsupported: 'dynamic callable name',
      }));
      expect(discovered, source).not.toEqual([]);
    }

    for (const source of [
      `const values = [1, 2, 3];
       values.reverse().fill(0, 0, 1);
       values.pop();`,
      `const values = ['a'];
       values.unshift('b');
       values.splice(-1, 1, 'c');`,
    ]) expect(discoverSupabaseCalls(source), source).toEqual([]);

    const cyclic = `
      const slots = [client.from, client, 'contract_hours_ledger'];
      slots.push(slots);
      slots.reverse();
      slots.reverse();
      slots[0].call(slots[1], slots[2]);
    `;
    expect(discoverSupabaseCalls(cyclic)).toEqual(discoverSupabaseCalls(cyclic));
    expectOneLedgerCall(cyclic);
  });

  it('resolves static CommonJS export state and ESM namespace re-exports', () => {
    const fixtureRoot = mkdtempSync(join(ROOT, '.z7-r16-modules-'));
    try {
      writeFileSync(join(fixtureRoot, 'factory.ts'), `
        import { createClient } from '@supabase/supabase-js';
        export const makeDatabase = () => createClient('url', 'key');
        export const inert = () => 'ordinary';
      `);
      writeFileSync(join(fixtureRoot, 'computed.cjs'), `
        const { createClient } = require('@supabase/supabase-js');
        const key = 'makeDatabase';
        const makeDatabase = () => createClient('url', 'key');
        exports[key] = makeDatabase;
        exports.inert = () => 'ordinary';
      `);
      writeFileSync(join(fixtureRoot, 'object.cjs'), `
        const { createClient } = require('@supabase/supabase-js');
        const makeDatabase = () => createClient('url', 'key');
        const inert = () => 'ordinary';
        module.exports = { makeDatabase, ['inert']: inert };
      `);
      writeFileSync(join(fixtureRoot, 'chained.cjs'), `
        const { createClient } = require('@supabase/supabase-js');
        const makeDatabase = () => createClient('url', 'key');
        exports = module.exports = { makeDatabase };
      `);
      writeFileSync(join(fixtureRoot, 'assigned.cjs'), `
        const { createClient } = require('@supabase/supabase-js');
        const makeDatabase = () => createClient('url', 'key');
        const base = { inert: () => 'ordinary' };
        Object.assign(exports, base, { makeDatabase });
      `);
      writeFileSync(join(fixtureRoot, 'spread.cjs'), `
        const { createClient } = require('@supabase/supabase-js');
        const base = { inert: () => 'ordinary' };
        const makeDatabase = () => createClient('url', 'key');
        module.exports = { ...base, ['makeDatabase']: makeDatabase };
      `);
      writeFileSync(join(fixtureRoot, 'forward.cjs'), `
        module.exports = require('@supabase/supabase-js');
      `);
      writeFileSync(join(fixtureRoot, 'namespace.ts'), `
        export * as factories from './factory';
      `);
      writeFileSync(join(fixtureRoot, 'barrel.ts'), `
        export * from './namespace';
      `);
      writeFileSync(join(fixtureRoot, 'cycle-a.ts'), `
        export * from './cycle-b';
        export * as factories from './factory';
      `);
      writeFileSync(join(fixtureRoot, 'cycle-b.ts'), `
        export * from './cycle-a';
      `);
      writeFileSync(join(fixtureRoot, 'bare-rebind.cjs'), `
        const { createClient } = require('@supabase/supabase-js');
        const makeDatabase = () => createClient('url', 'key');
        exports = { makeDatabase };
      `);
      writeFileSync(join(fixtureRoot, 'dynamic.cjs'), `
        const { createClient } = require('@supabase/supabase-js');
        const makeDatabase = () => createClient('url', 'key');
        exports[process.argv[2]] = makeDatabase;
      `);
      const importer = join(fixtureRoot, 'consumer.ts');
      for (const source of [
        `const api = require('./computed');
         api['makeDatabase']().from('contract_hours_ledger');`,
        `const { makeDatabase: open } = require('./object');
         open().from('contract_hours_ledger');`,
        `const api = require('./chained');
         const { makeDatabase } = api;
         makeDatabase().from('contract_hours_ledger');`,
        `const api = require('./assigned');
         api.makeDatabase().from('contract_hours_ledger');`,
        `import api from './spread';
         api.makeDatabase().from('contract_hours_ledger');`,
        `const supabase = require('./forward');
         supabase.createClient('url', 'key').from('contract_hours_ledger');`,
        `import { factories } from './namespace';
         factories.makeDatabase().from('contract_hours_ledger');`,
        `import * as api from './barrel';
         api.factories['makeDatabase']().from('contract_hours_ledger');`,
        `import { factories } from './cycle-a';
         factories.makeDatabase().from('contract_hours_ledger');`,
      ]) expect(directTableTouchCount(source, importer), source).toBe(1);

      const detachedBareExports = `const api = require('./bare-rebind');
        api.makeDatabase().from('contract_hours_ledger');`;
      expect(discoverSupabaseCalls(detachedBareExports, importer)).toEqual([]);
      expect(directTableTouchCount(detachedBareExports, importer)).toBe(0);

      for (const source of [
        `const api = require('./dynamic');
         api.makeDatabase().from('contract_hours_ledger');`,
      ]) expect(discoverSupabaseCalls(source, importer), source).toContainEqual(
        expect.objectContaining({ method: 'unknown', unsupported: 'dynamic callable name' })
      );

      const inert = `
        const api = require('./object');
        api.inert().from('contract_hours_ledger');
      `;
      expect(discoverSupabaseCalls(inert, importer).filter((call) => call.unsupported)).toEqual([]);
      expect(directTableTouchCount(inert, importer)).toBe(0);

      const circular = `
        import { factories } from './cycle-a';
        factories.makeDatabase().from('contract_hours_ledger');
      `;
      expect(discoverSupabaseCalls(circular, importer))
        .toEqual(discoverSupabaseCalls(circular, importer));
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('closes Round 17 mutable-sequence and CommonJS identity controls', () => {
    const exactLedgerCalls = (source: string, file = 'probe.ts'): number =>
      discoverSupabaseCalls(source, file).filter((call) => call.method === 'from' &&
        (call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger'))).length;

    for (const source of [
      `const slots = [];
       Array.prototype.unshift.call(slots, client.from, client, 'contract_hours_ledger');
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [];
       Reflect.apply(Array.prototype.unshift, slots, [
         client.from, client, 'contract_hours_ledger'
       ]);
       slots[0].call(slots[1], slots[2]);`,
    ]) expect.soft(exactLedgerCalls(source), source).toBe(1);

    const mayAliasControl = `
      const slots = ['contract_hours_ledger', client, client.from];
      const other = [];
      const alias = flag ? slots : other;
      alias.reverse();
      slots[0].call(slots[1], slots[2]);
    `;
    const mayAliasEvidence = discoverSupabaseCalls(mayAliasControl);
    expect(exactLedgerCalls(mayAliasControl) === 1 || mayAliasEvidence.some((call) =>
      call.method === 'unknown' && call.unsupported === 'dynamic callable name'
    ), mayAliasControl).toBe(true);
    expect(mayAliasEvidence, mayAliasControl).not.toEqual([]);

    const overwritten = `
      const slots = [client.from, client, 'contract_hours_ledger'];
      slots[0] = () => null;
      slots[0].call(slots[1], slots[2]);
    `;
    expect.soft(exactLedgerCalls(overwritten), overwritten).toBe(0);
    expect.soft(discoverSupabaseCalls(overwritten).filter((call) => call.unsupported),
      overwritten).toEqual([]);

    const mutationCases: Record<SequenceMutationName, {
      initial: string;
      args: string;
      invocation: string;
    }> = {
      push: {
        initial: `[client.from, client, 'contract_hours_ledger']`,
        args: `ordinary`, invocation: `slots[0].call(slots[1], slots[2]);`,
      },
      pop: {
        initial: `[client.from, client, 'contract_hours_ledger', ordinary]`,
        args: ``, invocation: `slots[0].call(slots[1], slots[2]);`,
      },
      shift: {
        initial: `[ordinary, client.from, client, 'contract_hours_ledger']`,
        args: ``, invocation: `slots[0].call(slots[1], slots[2]);`,
      },
      unshift: {
        initial: `[]`, args: `client.from, client, 'contract_hours_ledger'`,
        invocation: `slots[0].call(slots[1], slots[2]);`,
      },
      splice: {
        initial: `[ordinary, ordinary, ordinary]`,
        args: `0, 3, client.from, client, 'contract_hours_ledger'`,
        invocation: `slots[0].call(slots[1], slots[2]);`,
      },
      reverse: {
        initial: `['contract_hours_ledger', client, client.from]`,
        args: ``, invocation: `slots[0].call(slots[1], slots[2]);`,
      },
      fill: {
        initial: `[ordinary, client, 'contract_hours_ledger']`,
        args: `client.from, 0, 1`, invocation: `slots[0].call(slots[1], slots[2]);`,
      },
      copyWithin: {
        initial: `[ordinary, client, client.from, 'contract_hours_ledger']`,
        args: `0, 2, 3`, invocation: `slots[0].call(slots[1], slots[3]);`,
      },
      sort: {
        initial: `[client.from, client, 'contract_hours_ledger']`,
        args: `externalComparator`, invocation: `slots[0].call(slots[1], slots[2]);`,
      },
    };
    const exactMutators = (Object.keys(mutationCases) as SequenceMutationName[])
      .filter((method) => method !== 'sort');
    for (const method of exactMutators) {
      const { initial, args, invocation } = mutationCases[method];
      const argumentList = args ? `, ${args}` : '';
      const applied = args ? `[${args}]` : '[]';
      for (const operation of [
        `Array.prototype.${method}.call(slots${argumentList});`,
        `Array.prototype['${method}'].apply(slots, ${applied});`,
        `const mutate = Array.prototype.${method}.bind(slots${argumentList}); mutate();`,
        `Reflect.apply(Array.prototype['${method}'], slots, ${applied});`,
      ]) {
        const source = `const slots = ${initial}; ${operation} ${invocation}`;
        expect(exactLedgerCalls(source), `${method}: ${operation}`).toBe(1);
        expect(discoverSupabaseCalls(source).filter((call) => call.unsupported), source).toEqual([]);
      }
    }

    for (const source of [
      `const slots = [];
       const key = 'unshift';
       const { [key]: mutate } = Array.prototype;
       mutate.call(slots, client.from, client, 'contract_hours_ledger');
       slots[0].call(slots[1], slots[2]);`,
      `const slots = ['contract_hours_ledger', client, client.from];
       const call = Function.prototype.call.bind(Array.prototype.reverse);
       Reflect.apply(call, null, [slots]);
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       const first = slots;
       const second = first;
       second[0] = ordinary;
       first[0] = client.from;
       first[0].call(second[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       [slots[0]] = [ordinary];
       slots['0'] = client.from;
       slots[0].call(slots[1], slots[2]);`,
      `const slots = ['contract_hours_ledger', client, client.from];
       let alias;
       if (flag) alias = slots; else alias = slots;
       alias.reverse();
       slots[0].call(slots[1], slots[2]);`,
    ]) {
      expect(exactLedgerCalls(source), source).toBe(1);
      expect(discoverSupabaseCalls(source).filter((call) => call.unsupported), source).toEqual([]);
    }

    for (const source of [
      `Array.prototype.unshift.call(externalSlots, client.from, client,
         'contract_hours_ledger');
       externalSlots[0].call(externalSlots[1], externalSlots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       Array.prototype[process.argv[2]].call(slots);
       slots[0].call(slots[1], slots[2]);`,
      `const left = [client.from, client, 'contract_hours_ledger'];
       const right = ['contract_hours_ledger', client, client.from];
       const alias = condition ? left : right;
       alias.reverse();
       alias[0].call(alias[1], alias[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots[process.argv[2]] = ordinary;
       slots[0].call(slots[1], slots[2]);`,
      `function mutate(value) { Array.prototype.reverse.call(value); return value; }
       const original = ['contract_hours_ledger', client, client.from];
       const alias = mutate(original);
       alias[0].call(alias[1], alias[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       const other = [ordinary, ordinary, ordinary];
       let alias;
       if (flag) alias = slots; else alias = other;
       alias[0] = ordinary;
       slots[0].call(slots[1], slots[2]);`,
    ]) expect(discoverSupabaseCalls(source), source).toContainEqual(expect.objectContaining({
      method: 'unknown', unsupported: 'dynamic callable name',
    }));

    for (const source of [
      `const values = [1, 2]; Array.prototype.push.call(values, 3);`,
      `const values = ['a', 'b']; Reflect.apply(Array.prototype.reverse, values, []);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       const alias = slots;
       alias[0] = () => null;
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots['0'] = () => null;
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       [slots[0]] = [() => null];
       slots[0].call(slots[1], slots[2]);`,
    ]) {
      expect(exactLedgerCalls(source), source).toBe(0);
      expect(discoverSupabaseCalls(source).filter((call) => call.unsupported), source).toEqual([]);
    }

    const fixtureRoot = mkdtempSync(join(ROOT, '.z7-r17-old-controls-'));
    try {
      const factory = `
        const { createClient } = require('@supabase/supabase-js');
        const makeDatabase = () => createClient('url', 'key');
      `;
      writeFileSync(join(fixtureRoot, 'direct.cjs'), `${factory}
        const api = {};
        module.exports = api;
        api.makeDatabase = makeDatabase;
      `);
      writeFileSync(join(fixtureRoot, 'assign.cjs'), `${factory}
        const api = {};
        module.exports = api;
        Object.assign(api, { makeDatabase });
      `);
      writeFileSync(join(fixtureRoot, 'chained.cjs'), `${factory}
        const api = {};
        exports = module.exports = api;
        api.makeDatabase = makeDatabase;
      `);
      writeFileSync(join(fixtureRoot, 'computed.cjs'), `${factory}
        const api = {};
        const key = 'makeDatabase';
        module.exports = api;
        api[key] = makeDatabase;
      `);
      writeFileSync(join(fixtureRoot, 'assigned-export.cjs'), `${factory}
        const api = { inert: () => 'ordinary' };
        module.exports = Object.assign(api, { makeDatabase });
      `);
      writeFileSync(join(fixtureRoot, 'defined.cjs'), `${factory}
        const api = {};
        module.exports = api;
        Object.defineProperty(api, 'makeDatabase', { value: makeDatabase });
      `);
      writeFileSync(join(fixtureRoot, 'getter.cjs'), `${factory}
        const api = {};
        module.exports = api;
        Object.defineProperty(api, 'makeDatabase', { get: () => makeDatabase });
      `);
      writeFileSync(join(fixtureRoot, 'interop.cjs'), `${factory}
        const api = {};
        module.exports = api;
        Object.defineProperty(api, '__esModule', { value: true });
        api.default = makeDatabase;
        api.makeDatabase = makeDatabase;
      `);
      writeFileSync(join(fixtureRoot, 'replaced.cjs'), `${factory}
        const oldApi = {};
        module.exports = oldApi;
        const current = { inert: () => 'ordinary' };
        module.exports = current;
        oldApi.makeDatabase = makeDatabase;
      `);
      writeFileSync(join(fixtureRoot, 'dynamic.cjs'), `${factory}
        const api = {};
        module.exports = api;
        Object.defineProperty(api, process.argv[2], { value: makeDatabase });
      `);
      const importer = join(fixtureRoot, 'consumer.ts');
      for (const moduleName of [
        './direct', './assign', './chained', './computed', './assigned-export',
        './defined', './getter',
      ]) {
        expect.soft(exactLedgerCalls(`
          const api = require('${moduleName}');
          api.makeDatabase().from('contract_hours_ledger');
        `, importer), moduleName).toBe(1);
      }
      for (const source of [
        `const api = require('./interop');
         api.default().from('contract_hours_ledger');`,
        `import open from './interop';
         open().from('contract_hours_ledger');`,
        `import * as api from './interop';
         api.makeDatabase().from('contract_hours_ledger');`,
        `const { makeDatabase } = require('./interop');
         makeDatabase().from('contract_hours_ledger');`,
      ]) expect(exactLedgerCalls(source, importer), source).toBe(1);

      const replaced = `const api = require('./replaced');
        api.makeDatabase().from('contract_hours_ledger');`;
      expect(exactLedgerCalls(replaced, importer)).toBe(0);
      expect(discoverSupabaseCalls(replaced, importer).filter((call) => call.unsupported)).toEqual([]);

      const dynamic = `const api = require('./dynamic');
        api.makeDatabase().from('contract_hours_ledger');`;
      expect(discoverSupabaseCalls(dynamic, importer)).toContainEqual(expect.objectContaining({
        method: 'unknown', unsupported: 'dynamic callable name',
      }));
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('closes Round 18 mutable-property and recursive CommonJS heap controls', () => {
    const exactLedgerCalls = (source: string, file = 'probe.ts'): number =>
      discoverSupabaseCalls(source, file).filter((call) => call.method === 'from' &&
        (call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger'))).length;
    const unsupportedCalls = (source: string, file = 'probe.ts'): DiscoveredCall[] =>
      discoverSupabaseCalls(source, file).filter((call) => call.unsupported);

    const inertTransfers = [
      `const slots = [client.from, client, 'contract_hours_ledger'];
       Object.defineProperty(slots, '0', { value: () => null });
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       Reflect.set(slots, '0', () => null);
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       if (slots[0]) delete slots[0];
       if (slots[0]) slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots.length = 0;
       if (slots[0]) slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots[0] &&= () => null;
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots[0] += '';
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots[0]++;
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       --slots[0];
       slots[0].call(slots[1], slots[2]);`,
    ];
    inertTransfers.forEach((source) => {
      expect.soft(exactLedgerCalls(source), source).toBe(0);
      expect.soft(unsupportedCalls(source), source).toEqual([]);
    });

    const liveTransfers = [
      `const slots = [null, client, 'contract_hours_ledger'];
       Reflect.set(slots, 0, client.from);
       slots[0].call(slots[1], slots[2]);`,
      `const descriptor = { value: client.from };
       const slots = [ordinary, client, 'contract_hours_ledger'];
       Object.defineProperty(slots, '0', descriptor);
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [null, client, 'contract_hours_ledger'];
       slots[0] ||= client.from;
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [undefined, client, 'contract_hours_ledger'];
       slots[0] ??= client.from;
       slots[0].call(slots[1], slots[2]);`,
    ];
    liveTransfers.forEach((source) => {
      expect.soft(exactLedgerCalls(source), source).toBe(1);
      expect.soft(unsupportedCalls(source), source).toEqual([]);
    });
    for (const operator of [
      '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '^=', '|=',
    ]) {
      const source = `const slots = [client.from, client, 'contract_hours_ledger'];
        slots[0] ${operator} 1;
        slots[0].call(slots[1], slots[2]);`;
      expect.soft(exactLedgerCalls(source), source).toBe(0);
      expect.soft(unsupportedCalls(source), source).toEqual([]);
    }
    for (const source of [
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots[0] ||= ordinary;
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       slots[0] ??= ordinary;
       slots[0].call(slots[1], slots[2]);`,
      `function replace(sequence, key, value) { Reflect.set(sequence, key, value); }
       const slots = [ordinary, client, 'contract_hours_ledger'];
       replace(slots, 0, client.from);
       slots[0].call(slots[1], slots[2]);`,
    ]) {
      expect.soft(exactLedgerCalls(source), source).toBe(1);
      expect.soft(unsupportedCalls(source), source).toEqual([]);
    }

    const frozen = `const slots = Object.freeze([
        client.from, client, 'contract_hours_ledger'
      ]);
      try { Array.prototype.reverse.call(slots); } catch {}
      slots[0].call(slots[1], slots[2]);`;
    expect.soft(exactLedgerCalls(frozen), frozen).toBe(1);
    expect.soft(unsupportedCalls(frozen), frozen).toEqual([]);

    const runtimeLedgerCalls = (source: string): number => {
      let count = 0;
      const client = {
        from(target: string) {
          if (target === 'contract_hours_ledger') count += 1;
          return this;
        },
      };
      const run = new Function('client', source) as
        (runtimeClient: typeof client) => void;
      run(client);
      return count;
    };
    const integrityMutations: Record<Exclude<SequenceMutationName, 'sort'>, {
      initial: string;
      arguments: string;
      invocation: string;
    }> = {
      push: {
        initial: `[client.from, client, 'contract_hours_ledger']`,
        arguments: `ordinary`, invocation: `slots[0].call(slots[1], slots[2])`,
      },
      pop: {
        initial: `[client.from, client, 'contract_hours_ledger', ordinary]`,
        arguments: ``, invocation: `slots[0].call(slots[1], slots[2])`,
      },
      shift: {
        initial: `[ordinary, client.from, client, 'contract_hours_ledger']`,
        arguments: ``, invocation: `slots[0].call(slots[1], slots[2])`,
      },
      unshift: {
        initial: `[]`, arguments: `client.from, client, 'contract_hours_ledger'`,
        invocation: `slots[0].call(slots[1], slots[2])`,
      },
      splice: {
        initial: `[ordinary, ordinary, ordinary]`,
        arguments: `0, 3, client.from, client, 'contract_hours_ledger'`,
        invocation: `slots[0].call(slots[1], slots[2])`,
      },
      reverse: {
        initial: `['contract_hours_ledger', client, client.from]`, arguments: ``,
        invocation: `slots[0].call(slots[1], slots[2])`,
      },
      fill: {
        initial: `[ordinary, client, 'contract_hours_ledger']`,
        arguments: `client.from, 0, 1`, invocation: `slots[0].call(slots[1], slots[2])`,
      },
      copyWithin: {
        initial: `[ordinary, client, client.from, 'contract_hours_ledger']`,
        arguments: `0, 2, 3`, invocation: `slots[0].call(slots[1], slots[3])`,
      },
    };
    for (const integrity of ['freeze', 'seal', 'preventExtensions'] as const) {
      for (const [method, control] of Object.entries(integrityMutations)) {
        const source = `const ordinary = () => null;
          const slots = Object.${integrity}(${control.initial});
          try { Array.prototype.${method}.call(slots${control.arguments
            ? `, ${control.arguments}` : ''}); } catch {}
          try { ${control.invocation}; } catch {}`;
        const runtime = runtimeLedgerCalls(source);
        expect.soft(exactLedgerCalls(source), `${integrity}/${method}: ${source}`).toBe(runtime);
        expect.soft(unsupportedCalls(source), `${integrity}/${method}: ${source}`).toEqual([]);
      }
    }

    const integrityWrites = [
      `slots[0] = ordinary`,
      `Reflect.set(slots, 0, ordinary)`,
      `Object.defineProperty(slots, '0', { value: ordinary })`,
      `delete slots[0]`,
      `slots.length = 0`,
    ];
    for (const integrity of ['freeze', 'seal', 'preventExtensions'] as const) {
      for (const operation of integrityWrites) {
        const source = `const ordinary = () => null;
          const slots = Object.${integrity}([
            client.from, client, 'contract_hours_ledger'
          ]);
          try { ${operation}; } catch {}
          try { slots[0].call(slots[1], slots[2]); } catch {}`;
        const runtime = runtimeLedgerCalls(source);
        expect.soft(exactLedgerCalls(source), `${integrity}/${operation}`).toBe(runtime);
        expect.soft(unsupportedCalls(source), `${integrity}/${operation}`).toEqual([]);
      }
    }

    for (const source of [
      `const slots = [client.from, client, 'contract_hours_ledger'];
       Reflect.set(slots, process.argv[2], ordinary);
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       Object.defineProperty(slots, process.argv[2], { value: ordinary });
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       delete slots[process.argv[2]];
       slots[0].call(slots[1], slots[2]);`,
    ]) expect(discoverSupabaseCalls(source), source).toContainEqual(expect.objectContaining({
      method: 'unknown', unsupported: 'dynamic callable name',
    }));

    const fixtureRoot = mkdtempSync(join(ROOT, '.z7-r18-old-controls-'));
    try {
      const factory = `
        const { createClient } = require('@supabase/supabase-js');
        const makeDatabase = () => createClient('http://127.0.0.1:54321', 'synthetic-key');
      `;
      writeFileSync(join(fixtureRoot, 'define-properties.cjs'), `${factory}
        const api = {};
        module.exports = api;
        Object.defineProperties(api, {
          makeDatabase: { value: makeDatabase },
          inert: { value: () => 'ordinary' },
        });
      `);
      writeFileSync(join(fixtureRoot, 'nested.cjs'), `${factory}
        const api = { nested: {} };
        module.exports = api;
        const retained = api.nested;
        retained.makeDatabase = makeDatabase;
      `);
      writeFileSync(join(fixtureRoot, 'descriptor-alias.cjs'), `${factory}
        const api = {};
        const descriptor = { value: makeDatabase };
        module.exports = api;
        Object.defineProperty(api, 'makeDatabase', descriptor);
      `);
      writeFileSync(join(fixtureRoot, 'getter.cjs'), `${factory}
        const api = { get makeDatabase() { return makeDatabase; } };
        module.exports = api;
      `);
      writeFileSync(join(fixtureRoot, 'prototype.cjs'), `${factory}
        const prototype = { makeDatabase };
        module.exports = Object.create(prototype);
      `);
      writeFileSync(join(fixtureRoot, 'deleted.cjs'), `${factory}
        const api = { makeDatabase };
        module.exports = api;
        delete api.makeDatabase;
      `);
      writeFileSync(join(fixtureRoot, 'shadowed.cjs'), `${factory}
        const prototype = { makeDatabase };
        const api = Object.create(prototype);
        api.makeDatabase = () => 'ordinary';
        module.exports = api;
      `);
      writeFileSync(join(fixtureRoot, 'inherited-after-delete.cjs'), `${factory}
        const prototype = { makeDatabase };
        const api = Object.create(prototype);
        api.makeDatabase = () => 'ordinary';
        delete api.makeDatabase;
        module.exports = api;
      `);
      writeFileSync(join(fixtureRoot, 'getter-descriptor.cjs'), `${factory}
        const api = {};
        const descriptor = { get() { return makeDatabase; } };
        module.exports = api;
        Object.defineProperties(api, { makeDatabase: descriptor });
      `);
      writeFileSync(join(fixtureRoot, 'replaced-nested.cjs'), `${factory}
        const nested = {};
        const prior = { nested };
        module.exports = prior;
        module.exports = { inert: () => 'ordinary' };
        nested.makeDatabase = makeDatabase;
      `);
      writeFileSync(join(fixtureRoot, 'bridge.cjs'), `
        module.exports = require('./nested');
      `);
      writeFileSync(join(fixtureRoot, 'barrel.mjs'), `
        export { default } from './bridge.cjs';
        export * as api from './bridge.cjs';
      `);
      const importer = join(fixtureRoot, 'consumer.ts');
      for (const moduleName of [
        './define-properties', './nested', './descriptor-alias', './getter', './prototype',
        './inherited-after-delete', './getter-descriptor',
      ]) {
        const source = `const api = require('${moduleName}');
          api${moduleName === './nested' ? '.nested' : ''}.makeDatabase()
            .from('contract_hours_ledger');`;
        expect.soft(exactLedgerCalls(source, importer), moduleName).toBe(1);
        expect.soft(unsupportedCalls(source, importer), moduleName).toEqual([]);
      }
      for (const moduleName of ['./deleted', './shadowed', './replaced-nested']) {
        const source = `const api = require('${moduleName}');
          api.makeDatabase().from('contract_hours_ledger');`;
        expect.soft(exactLedgerCalls(source, importer), moduleName).toBe(0);
        expect.soft(unsupportedCalls(source, importer), moduleName).toEqual([]);
      }
      for (const source of [
        `const api = require('./bridge');
         api.nested.makeDatabase().from('contract_hours_ledger');`,
        `import api from './barrel.mjs';
         api.nested.makeDatabase().from('contract_hours_ledger');`,
        `import { api } from './barrel.mjs';
         api.nested.makeDatabase().from('contract_hours_ledger');`,
        `const { nested } = require('./bridge');
         nested['makeDatabase']().from('contract_hours_ledger');`,
      ]) {
        expect.soft(exactLedgerCalls(source, importer), source).toBe(1);
        expect.soft(unsupportedCalls(source, importer), source).toEqual([]);
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('matches the Round 19 descriptor and prototype runtime oracle', () => {
    const exactLedgerCalls = (source: string): number =>
      discoverSupabaseCalls(source).filter((call) => call.method === 'from' &&
        (call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger'))).length;
    const unsupportedCount = (source: string): number =>
      discoverSupabaseCalls(source).filter((call) => call.unsupported).length;
    const runtime = (source: string): { calls: number; thrown?: string } => {
      let calls = 0;
      const client = {
        from(target: string) {
          if (target === 'contract_hours_ledger') calls += 1;
          return this;
        },
      };
      try {
        const run = new Function('client', 'ordinary', source) as
          (runtimeClient: typeof client, ordinary: () => null) => void;
        run(client, () => null);
        return { calls };
      } catch (error) {
        return { calls, thrown: error instanceof Error ? error.name : String(error) };
      }
    };
    const cases = [
      `const slots = { client, target: 'contract_hours_ledger' };
       Object.defineProperty(slots, 'read', { value: client.from });
       slots.read = ordinary;
       slots.read.call(slots.client, slots.target);`,
      `const slots = { client, target: 'contract_hours_ledger' };
       Object.defineProperty(slots, 'read', { value: client.from });
       delete slots.read;
       slots.read.call(slots.client, slots.target);`,
      `const slots = [client.from, client, 'contract_hours_ledger'];
       Reflect.deleteProperty(slots, '0');
       if (slots[0]) slots[0].call(slots[1], slots[2]);`,
      `const inert = () => null;
       const slots = [client.from, client, 'contract_hours_ledger'];
       Reflect.defineProperty(slots, '0', { value: inert });
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [ordinary, client, 'contract_hours_ledger'];
       Object.defineProperties(slots, {
         0: { value: client.from }, hidden: { value: ordinary }
       });
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [ordinary, client, 'contract_hours_ledger'];
       Object.defineProperty(slots, 'install', {
         set(value) { this[0] = value; }
       });
       slots.install = client.from;
       slots[0].call(slots[1], slots[2]);`,
      `const slots = [ordinary, client, 'contract_hours_ledger'];
       const prototype = { read: client.from };
       Object.setPrototypeOf(slots, prototype);
       slots.read.call(slots[1], slots[2]);`,
    ];

    for (const source of cases) {
      const observed = runtime(source);
      expect.soft(observed.thrown, source).toBeUndefined();
      expect.soft(exactLedgerCalls(source), source).toBe(observed.calls);
      expect.soft(unsupportedCount(source), source).toBe(0);
    }
  });

  it('propagates Round 19 abrupt completions and caught integrity failures', () => {
    const analyze = (source: string): { exact: number; unsupported: number } => {
      const discovered = discoverSupabaseCalls(source);
      return {
        exact: discovered.filter((call) => call.method === 'from' &&
          (call.target === 'contract_hours_ledger' ||
           call.targets?.includes('contract_hours_ledger'))).length,
        unsupported: discovered.filter((call) => call.unsupported).length,
      };
    };
    const runtime = (source: string): { calls: number; thrown?: string } => {
      let calls = 0;
      const client = {
        from(target: string) {
          if (target === 'contract_hours_ledger') calls += 1;
          return this;
        },
      };
      try {
        const run = new Function('client', 'ordinary', source) as
          (runtimeClient: typeof client, ordinary: () => null) => void;
        run(client, () => null);
        return { calls };
      } catch (error) {
        return { calls, thrown: error instanceof Error ? error.name : String(error) };
      }
    };
    const uncaught = [
      `'use strict';
       const slots = Object.freeze([client.from, client, 'contract_hours_ledger']);
       slots[0] = ordinary;
       slots[0].call(slots[1], slots[2]);`,
      `'use strict';
       const slots = Object.seal([client.from, client, 'contract_hours_ledger']);
       delete slots[0];
       slots[0].call(slots[1], slots[2]);`,
      `'use strict';
       const slots = Object.freeze(['contract_hours_ledger', client, client.from]);
       slots.reverse();
       slots[0].call(slots[1], slots[2]);`,
    ];
    for (const source of uncaught) {
      const observed = runtime(source);
      expect.soft(observed).toEqual({ calls: 0, thrown: 'TypeError' });
      expect.soft(analyze(source), source).toEqual({ exact: 0, unsupported: 0 });
    }

    const caughtSort = `'use strict';
      const slots = Object.freeze([client.from, client, 'contract_hours_ledger']);
      try { slots.sort(); } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
      slots[0].call(slots[1], slots[2]);`;
    expect.soft(runtime(caughtSort)).toEqual({ calls: 1 });
    expect.soft(analyze(caughtSort)).toEqual({ exact: 1, unsupported: 0 });
  });

  it('matches the Round 19 runtime oracle for all nine integrity mutators', () => {
    const analyze = (source: string): { exact: number; unsupported: number } => {
      const discovered = discoverSupabaseCalls(source);
      return {
        exact: discovered.filter((call) => call.method === 'from' &&
          call.target === 'contract_hours_ledger').length,
        unsupported: discovered.filter((call) => call.unsupported).length,
      };
    };
    const runtime = (source: string): { calls: number; thrown?: string } => {
      let calls = 0;
      const client = {
        from(target: string) {
          if (target === 'contract_hours_ledger') calls += 1;
          return this;
        },
      };
      try {
        (new Function('client', source) as (value: typeof client) => void)(client);
        return { calls };
      } catch (error) {
        return { calls, thrown: error instanceof Error ? error.name : String(error) };
      }
    };
    const invocations: Record<SequenceMutationName, string> = {
      push: 'slots.push(inert)',
      pop: 'slots.pop()',
      shift: 'slots.shift()',
      unshift: 'slots.unshift(inert)',
      splice: 'slots.splice(0, 0, inert)',
      reverse: 'slots.reverse()',
      fill: 'slots.fill(inert, 0, 1)',
      copyWithin: 'slots.copyWithin(0, 1, 2)',
      sort: 'slots.sort()',
    };
    for (const [method, invocation] of Object.entries(invocations)) {
      const prefix = `'use strict'; const inert = () => null;
        const slots = Object.freeze([client.from, client, 'contract_hours_ledger']);`;
      const caught = `${prefix}
        try { ${invocation}; } catch (error) {
          if (!(error instanceof TypeError)) throw error;
        }
        slots[0].call(slots[1], slots[2]);`;
      expect.soft(runtime(caught), `${method}/caught-runtime`).toEqual({ calls: 1 });
      expect.soft(analyze(caught), `${method}/caught-analysis`)
        .toEqual({ exact: 1, unsupported: 0 });

      const uncaught = `${prefix}
        ${invocation};
        slots[0].call(slots[1], slots[2]);`;
      expect.soft(runtime(uncaught), `${method}/uncaught-runtime`)
        .toEqual({ calls: 0, thrown: 'TypeError' });
      expect.soft(analyze(uncaught), `${method}/uncaught-analysis`)
        .toEqual({ exact: 0, unsupported: 0 });
    }

    const writes = [
      `const slots = Object.freeze([client.from, client, 'contract_hours_ledger']);
       slots[0] = () => null;
       slots[0].call(slots[1], slots[2]);`,
      `const slots = Object.seal([client.from, client, 'contract_hours_ledger']);
       delete slots[0];
       slots[0].call(slots[1], slots[2]);`,
      `const slots = Object.freeze([client.from, client, 'contract_hours_ledger']);
       Reflect.set(slots, 0, () => null);
       Reflect.deleteProperty(slots, 0);
       slots[0].call(slots[1], slots[2]);`,
    ];
    for (const source of writes) {
      expect.soft(runtime(source), source).toEqual({ calls: 1 });
      expect.soft(analyze(source), source).toEqual({ exact: 1, unsupported: 0 });
    }
  });

  it('composes Round 19 descriptor flags, accessors, prototypes, and completions', () => {
    const exactLedgerCalls = (source: string): number =>
      discoverSupabaseCalls(source).filter((call) => call.method === 'from' &&
        call.target === 'contract_hours_ledger').length;
    const unsupported = (source: string): DiscoveredCall[] =>
      discoverSupabaseCalls(source).filter((call) => call.unsupported);
    const exactCases = [
      `const object = { factory: client.from };
       Object.defineProperty(object, 'read', { value: () => null, configurable: true });
       Object.defineProperty(object, 'read', { get() { return this.factory; } });
       object.read.call(client, 'contract_hours_ledger');`,
      `const object = { factory: client.from };
       Object.defineProperty(object, 'read', {
         get() { return () => null; }, configurable: true
       });
       Object.defineProperty(object, 'read', { value: client.from });
       object.read.call(client, 'contract_hours_ledger');`,
      `const prototype = {};
       Object.defineProperty(prototype, 'install', {
         set(value) { this.read = value; }
       });
       const object = { client, target: 'contract_hours_ledger' };
       Object.setPrototypeOf(object, prototype);
       object.install = client.from;
       object.read.call(object.client, object.target);`,
      `const prototype = { read: client.from };
       const middle = Object.create(prototype);
       const object = Object.create(middle);
       object.read = () => null;
       delete object.read;
       object.read.call(client, 'contract_hours_ledger');`,
      `const prototype = {};
       Object.defineProperty(prototype, 'install', {
         set(value) { this.read = value; }
       });
       const object = Object.create(prototype);
       Object.assign(object, { install: client.from });
       object.read.call(client, 'contract_hours_ledger');`,
      `const source = {};
       Object.defineProperties(source, {
         hidden: { value: () => null },
         read: { value: client.from, enumerable: true }
       });
       const copy = { ...source };
       copy.read.call(client, 'contract_hours_ledger');`,
      `const object = {};
       Object.defineProperty(object, 'read', {
         value: client.from, writable: false, configurable: false
       });
       try {
         Object.defineProperties(object, {
           inert: { value: () => null }, read: { value: () => null }
         });
       } catch {}
       object.read.call(client, 'contract_hours_ledger');`,
      `function read() {
         for (let index = 0; index < 1; index += 1) {
           break;
           client.from('contract_hours_ledger');
         }
         try { throw new Error('synthetic'); }
         catch { return client.from('contract_hours_ledger'); }
         finally { const inert = true; }
       }
       read();`,
      `function read() {
         try { throw new Error('synthetic'); }
         finally { client.from('contract_hours_ledger'); }
       }
       try { read(); } catch {}`,
    ];
    for (const source of exactCases) {
      expect.soft(exactLedgerCalls(source), source).toBe(1);
      expect.soft(unsupported(source), source).toEqual([]);
    }

    const inertCases = [
      `const source = {};
       Object.defineProperty(source, 'read', { value: client.from });
       const copy = { ...source };
       if (copy.read) copy.read('contract_hours_ledger');`,
      `function read() {
         return;
         client.from('contract_hours_ledger');
       }
       read();`,
      `try { const inert = true; }
       finally { throw new Error('synthetic'); }
       client.from('contract_hours_ledger');`,
      `for (let index = 0; index < 1; index += 1) {
         continue;
         client.from('contract_hours_ledger');
       }`,
    ];
    for (const source of inertCases) {
      expect.soft(exactLedgerCalls(source), source).toBe(0);
      expect.soft(unsupported(source), source).toEqual([]);
    }

    const dynamic = `const object = {};
      Object.setPrototypeOf(object, externalPrototype);
      object.read.call(client, 'contract_hours_ledger');`;
    expect(exactLedgerCalls(dynamic)).toBe(0);
    expect(unsupported(dynamic)).toHaveLength(1);
  });

  it('uses descriptor/prototype semantics across CommonJS consumers', () => {
    const fixtureRoot = mkdtempSync(join(ROOT, '.z7-r19-modules-'));
    const importer = join(fixtureRoot, 'consumer.cjs');
    const exactLedgerCalls = (source: string): number =>
      discoverSupabaseCalls(source, importer).filter((call) => call.method === 'from' &&
        (call.target === 'contract_hours_ledger' ||
         call.targets?.includes('contract_hours_ledger'))).length;
    const unsupportedCount = (source: string): number =>
      discoverSupabaseCalls(source, importer).filter((call) => call.unsupported).length;
    const runtimeCalls = (moduleName: string, expression: string): {
      calls: number;
      thrown?: string;
    } => {
      const runtimeRequire = createRequire(importer);
      (globalThis as { __z7R19Calls?: number }).__z7R19Calls = 0;
      try {
        const api = runtimeRequire(join(fixtureRoot, moduleName)) as unknown;
        const run = new Function('api', expression) as (value: unknown) => void;
        run(api);
        return { calls: (globalThis as { __z7R19Calls?: number }).__z7R19Calls ?? 0 };
      } catch (error) {
        return {
          calls: (globalThis as { __z7R19Calls?: number }).__z7R19Calls ?? 0,
          thrown: error instanceof Error ? error.name : String(error),
        };
      } finally {
        delete (globalThis as { __z7R19Calls?: number }).__z7R19Calls;
      }
    };
    const factory = `
      const { createClient } = require('@supabase/supabase-js');
      const makeDatabase = () => {
        globalThis.__z7R19Calls += 1;
        return createClient('http://127.0.0.1:54321', 'synthetic-key');
      };
    `;
    try {
      writeFileSync(join(fixtureRoot, 'nonwritable.cjs'), `${factory}
        const api = {};
        Object.defineProperty(api, 'makeDatabase', { value: makeDatabase });
        api.makeDatabase = () => null;
        module.exports = api;
      `);
      writeFileSync(join(fixtureRoot, 'nonconfigurable.cjs'), `${factory}
        const api = {};
        Object.defineProperty(api, 'makeDatabase', { value: makeDatabase });
        delete api.makeDatabase;
        module.exports = api;
      `);
      writeFileSync(join(fixtureRoot, 'nonenumerable.cjs'), `${factory}
        const source = {};
        Object.defineProperty(source, 'makeDatabase', { value: makeDatabase });
        module.exports = Object.assign({}, source);
      `);
      writeFileSync(join(fixtureRoot, 'getter-this.cjs'), `${factory}
        const api = { factory: makeDatabase };
        Object.defineProperty(api, 'makeDatabase', {
          get() { return this.factory; }
        });
        module.exports = api;
      `);
      writeFileSync(join(fixtureRoot, 'prototype.cjs'), `${factory}
        const api = {};
        Object.setPrototypeOf(api, { makeDatabase });
        module.exports = api;
      `);
      const cases = [
        ['nonwritable.cjs', `api.makeDatabase().from('contract_hours_ledger');`],
        ['nonconfigurable.cjs', `api.makeDatabase().from('contract_hours_ledger');`],
        ['nonenumerable.cjs', `api.makeDatabase().from('contract_hours_ledger');`],
        ['getter-this.cjs', `api.makeDatabase().from('contract_hours_ledger');`],
        ['prototype.cjs', `api.makeDatabase().from('contract_hours_ledger');`],
      ] as const;
      for (const [moduleName, expression] of cases) {
        const source = `const api = require('./${moduleName}'); ${expression}`;
        const observed = runtimeCalls(moduleName, expression);
        expect.soft(exactLedgerCalls(source), moduleName).toBe(observed.calls);
        expect.soft(unsupportedCount(source), moduleName).toBe(0);
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('preserves enumerable descriptors and abrupt completion across module consumers', () => {
    const fixtureRoot = mkdtempSync(join(ROOT, '.z7-r19-completion-modules-'));
    const importer = join(fixtureRoot, 'consumer.cjs');
    const analyze = (source: string): { exact: number; unsupported: number } => {
      const discovered = discoverSupabaseCalls(source, importer);
      return {
        exact: discovered.filter((call) => call.method === 'from' &&
          call.target === 'contract_hours_ledger').length,
        unsupported: discovered.filter((call) => call.unsupported).length,
      };
    };
    const factory = `
      const { createClient } = require('@supabase/supabase-js');
      const makeDatabase = () => createClient('http://127.0.0.1:54321', 'synthetic-key');
    `;
    try {
      writeFileSync(join(fixtureRoot, 'enumerable.cjs'), `${factory}
        const source = {};
        Object.defineProperty(source, 'makeDatabase', {
          value: makeDatabase, enumerable: true
        });
        module.exports = { ...source };
      `);
      writeFileSync(join(fixtureRoot, 'nonenumerable.cjs'), `${factory}
        const source = {};
        Object.defineProperty(source, 'makeDatabase', { value: makeDatabase });
        module.exports = { ...source };
      `);
      writeFileSync(join(fixtureRoot, 'abrupt.cjs'), `${factory}
        module.exports = { makeDatabase };
        throw new Error('synthetic module failure');
        module.exports.makeDatabase = () => null;
      `);

      expect(analyze(`const api = require('./enumerable');
        api.makeDatabase().from('contract_hours_ledger');`))
        .toEqual({ exact: 1, unsupported: 0 });
      expect(analyze(`const api = require('./nonenumerable');
        if (api.makeDatabase) {
          api.makeDatabase().from('contract_hours_ledger');
        }`)).toEqual({ exact: 0, unsupported: 0 });
      expect(analyze(`try {
          const api = require('./abrupt');
          api.makeDatabase().from('contract_hours_ledger');
        } catch {}
        client.from('contract_hours_ledger');`))
        .toEqual({ exact: 1, unsupported: 0 });
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('matches the Round 20 explicit Reflect receiver runtime oracle', () => {
    const analyze = (source: string): { exact: number; unsupported: number } => {
      const discovered = discoverSupabaseCalls(source);
      return {
        exact: discovered.filter((call) => call.method === 'from' &&
          call.target === 'contract_hours_ledger').length,
        unsupported: discovered.filter((call) => call.unsupported).length,
      };
    };
    const runtime = (source: string): { calls: number; thrown?: string } => {
      let calls = 0;
      const client = { from(target: string) {
        if (target === 'contract_hours_ledger') calls += 1;
        return this;
      } };
      try {
        (new Function('client', source) as (value: typeof client) => void)(client);
        return { calls };
      } catch (error) {
        return { calls, thrown: error instanceof Error ? error.name : String(error) };
      }
    };
    const cases = [
      `const proto = {};
       Object.defineProperty(proto, 'x', {
         set(value) { this.fn = value; },
       });
       const receiver = {};
       Reflect.set(proto, 'x', client.from, receiver);
       receiver.fn('contract_hours_ledger');`,
      `const proto = {
         get x() { return this.fn; },
       };
       const receiver = { fn: client.from };
       Reflect.get(proto, 'x', receiver)('contract_hours_ledger');`,
    ];
    for (const source of cases) {
      expect.soft(runtime(source), source).toEqual({ calls: 1 });
      expect.soft(analyze(source), source).toEqual({ exact: 1, unsupported: 0 });
    }
  });

  it('prevalidates Round 20 defineProperties descriptors before mutation', () => {
    const source = `const noop = () => {};
      const target = { a: noop };
      try {
        Object.defineProperties(target, {
          a: { value: client.from },
          bad: { get() {}, value: 0 },
        });
      } catch {}
      target.a('contract_hours_ledger');`;
    let calls = 0;
    const client = { from(target: string) {
      if (target === 'contract_hours_ledger') calls += 1;
      return this;
    } };
    (new Function('client', source) as (value: typeof client) => void)(client);
    expect(calls).toBe(0);
    expect(discoverSupabaseCalls(source).filter((call) => call.method === 'from' &&
      call.target === 'contract_hours_ledger')).toHaveLength(0);
    expect(discoverSupabaseCalls(source).filter((call) => call.unsupported)).toEqual([]);
  });

  it('routes Round 20 descriptor and prototype inspection through the shared heap', () => {
    const analyze = (source: string): { exact: number; unsupported: number } => {
      const discovered = discoverSupabaseCalls(source);
      return {
        exact: discovered.filter((call) => call.method === 'from' &&
          call.target === 'contract_hours_ledger').length,
        unsupported: discovered.filter((call) => call.unsupported).length,
      };
    };
    const cases = [
      `const object = Object.create(null, {
         fn: { value: client.from },
       });
       object.fn('contract_hours_ledger');`,
      `const object = { fn: client.from };
       Object.getOwnPropertyDescriptor(object, 'fn')
         .value('contract_hours_ledger');`,
      `const prototype = { fn: client.from };
       const object = Object.create(prototype);
       Object.getPrototypeOf(object).fn('contract_hours_ledger');`,
    ];
    for (const source of cases) {
      expect.soft(analyze(source), source).toEqual({ exact: 1, unsupported: 0 });
    }
  });

  it('preserves Round 20 indexed and length descriptor mutator failures', () => {
    const analyze = (source: string): { exact: number; unsupported: number } => {
      const discovered = discoverSupabaseCalls(source);
      return {
        exact: discovered.filter((call) => call.method === 'from' &&
          call.target === 'contract_hours_ledger').length,
        unsupported: discovered.filter((call) => call.unsupported).length,
      };
    };
    const runtime = (source: string): { calls: number; thrown?: string } => {
      let calls = 0;
      const client = { from(target: string) {
        if (target === 'contract_hours_ledger') calls += 1;
        return this;
      } };
      try {
        (new Function('client', source) as (value: typeof client) => void)(client);
        return { calls };
      } catch (error) {
        return { calls, thrown: error instanceof Error ? error.name : String(error) };
      }
    };
    const cases = [
      `const noop = () => {};
       const values = [noop, client.from];
       Object.defineProperty(values, '0', { writable: false });
       try { values.reverse(); } catch {}
       values[0]('contract_hours_ledger');`,
      `const values = [];
       Object.defineProperty(values, 'length', { writable: false });
       try { values.push(client.from); } catch {}
       if (values[0]) values[0]('contract_hours_ledger');`,
    ];
    for (const source of cases) {
      expect.soft(runtime(source), source).toEqual({ calls: 0 });
      expect.soft(analyze(source), source).toEqual({ exact: 0, unsupported: 0 });
    }
  });

  it('propagates Round 20 switch and call-driven module completions', () => {
    const switchSource = `switch (1) {
      case 0:
        client.from('contract_hours_ledger');
        break;
      case 1:
        break;
    }`;
    expect.soft(discoverSupabaseCalls(switchSource).filter((call) => call.method === 'from' &&
      call.target === 'contract_hours_ledger')).toHaveLength(0);

    const fixtureRoot = mkdtempSync(join(ROOT, '.z7-r20-call-throw-'));
    const importer = join(fixtureRoot, 'consumer.cjs');
    try {
      writeFileSync(join(fixtureRoot, 'abrupt.cjs'), `
        const { createClient } = require('@supabase/supabase-js');
        const makeDatabase = () => createClient(
          'http://127.0.0.1:54321', 'synthetic-key'
        );
        module.exports = { makeDatabase: () => null };
        function stop() { throw new Error('synthetic module failure'); }
        stop();
        module.exports.makeDatabase = makeDatabase;
      `);
      const source = `try {
        const api = require('./abrupt');
        api.makeDatabase().from('contract_hours_ledger');
      } catch {}`;
      const discovered = discoverSupabaseCalls(source, importer);
      expect.soft(discovered.filter((call) => call.method === 'from' &&
        call.target === 'contract_hours_ledger')).toHaveLength(0);
      expect.soft(discovered.filter((call) => call.unsupported)).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('composes Round 20 receivers, inspection, and descriptor conversion', () => {
    const analyze = (source: string): { exact: number; unsupported: number } => {
      const discovered = discoverSupabaseCalls(source);
      return {
        exact: discovered.filter((call) => call.method === 'from' &&
          call.target === 'contract_hours_ledger').length,
        unsupported: discovered.filter((call) => call.unsupported).length,
      };
    };
    const exactCases = [
      `const prototype = { fn: () => {} };
       const receiver = {};
       Reflect.set(prototype, 'fn', client.from, receiver);
       receiver.fn('contract_hours_ledger');`,
      `const root = { get fn() { return this.factory; } };
       const middle = Object.create(root);
       const receiver = { factory: client.from };
       Reflect.get(middle, 'fn', receiver)('contract_hours_ledger');`,
      `const object = { fn: client.from };
       const descriptor = Object.getOwnPropertyDescriptor(object, 'fn');
       descriptor.value = () => {};
       object.fn('contract_hours_ledger');`,
      `const object = { fn: client.from };
       Object.getOwnPropertyDescriptors(object).fn.value(
         'contract_hours_ledger'
       );`,
      `const object = Object.create(null, {
         factory: { value: client.from },
         fn: { get() { return this.factory; } },
       });
       object.fn('contract_hours_ledger');`,
      `const object = { fn: client.from };
       Reflect.getOwnPropertyDescriptor(object, 'fn').value(
         'contract_hours_ledger'
       );`,
      `const noop = () => {};
       const target = { a: noop };
       Object.defineProperty(target, 'locked', {
         value: noop, configurable: false,
       });
       try {
         Object.defineProperties(target, {
           a: { value: client.from },
           locked: { value: client.from },
         });
       } catch {}
       target.a('contract_hours_ledger');`,
    ];
    exactCases.forEach((source) => {
      expect.soft(analyze(source), source).toEqual({ exact: 1, unsupported: 0 });
    });

    const inertCases = [
      `const noop = () => {};
       const target = { fn: client.from };
       const receiver = {};
       Object.defineProperty(receiver, 'fn', { value: noop });
       const success = Reflect.set(target, 'fn', client.from, receiver);
       if (success) receiver.fn('contract_hours_ledger');`,
      `const object = {};
       const descriptor = Object.getOwnPropertyDescriptor(object, 'missing');
       if (descriptor) descriptor.value('contract_hours_ledger');`,
      `const noop = () => {};
       const target = { a: noop };
       const descriptors = { a: { value: client.from } };
       Object.defineProperty(descriptors, 'bad', {
         enumerable: true,
         get() { throw new Error('synthetic conversion failure'); },
       });
       try { Object.defineProperties(target, descriptors); } catch {}
       target.a('contract_hours_ledger');`,
      `const noop = () => {};
       const target = { a: noop };
       const descriptors = {};
       Object.defineProperty(descriptors, 'a', {
         value: { value: client.from }, enumerable: false,
       });
       Object.defineProperties(target, descriptors);
       target.a('contract_hours_ledger');`,
    ];
    inertCases.forEach((source) => {
      expect.soft(analyze(source), source).toEqual({ exact: 0, unsupported: 0 });
    });

    const dynamicCases = [
      `Reflect.get(externalProxy, externalKey, externalReceiver)(
         'contract_hours_ledger'
       );`,
      `const target = { a: () => {} };
       try { Object.defineProperties(target, externalDescriptors); } catch {}
       target.a('contract_hours_ledger');`,
      `Object.getOwnPropertyDescriptor(externalProxy, externalKey)
         .value('contract_hours_ledger');`,
    ];
    dynamicCases.forEach((source) => {
      expect.soft(analyze(source), source).toEqual({ exact: 0, unsupported: 1 });
    });
  });

  it('matches descriptor-aware partial effects for every Round 20 mutator', () => {
    const analyze = (source: string): { exact: number; unsupported: number } => {
      const discovered = discoverSupabaseCalls(source);
      return {
        exact: discovered.filter((call) => call.method === 'from' &&
          call.target === 'contract_hours_ledger').length,
        unsupported: discovered.filter((call) => call.unsupported).length,
      };
    };
    const runtime = (source: string): { exact: number; thrown?: string } => {
      let exact = 0;
      const client = { from(target: string) {
        if (target === 'contract_hours_ledger') exact += 1;
        return this;
      } };
      try {
        (new Function('client', source) as (value: typeof client) => void)(client);
        return { exact };
      } catch (error) {
        return { exact, thrown: error instanceof Error ? error.name : String(error) };
      }
    };
    const cases: Record<SequenceMutationName, string> = {
      push: `const values = [];
        Object.defineProperty(values, 'length', { writable: false });
        try { values.push(client.from); } catch {}
        if (values[0]) values[0]('contract_hours_ledger');`,
      pop: `const values = [() => {}, client.from];
        Object.defineProperty(values, '1', { configurable: false });
        try { values.pop(); } catch {}
        values[1]('contract_hours_ledger');`,
      shift: `const values = [() => {}, client.from];
        Object.defineProperty(values, '0', { writable: false });
        try { values.shift(); } catch {}
        values[0]('contract_hours_ledger');`,
      unshift: `const values = [() => {}];
        Object.defineProperty(values, '0', { writable: false });
        try { values.unshift(client.from); } catch {}
        values[0]('contract_hours_ledger');`,
      splice: `const values = [() => {}, client.from];
        Object.defineProperty(values, '0', { writable: false });
        try { values.splice(0, 1); } catch {}
        values[0]('contract_hours_ledger');`,
      reverse: `const values = [() => {}, client.from];
        Object.defineProperty(values, '0', { writable: false });
        try { values.reverse(); } catch {}
        values[0]('contract_hours_ledger');`,
      fill: `const values = [() => {}, client.from];
        Object.defineProperty(values, '0', { writable: false });
        try { values.fill(client.from); } catch {}
        values[0]('contract_hours_ledger');`,
      copyWithin: `const values = [() => {}, client.from];
        Object.defineProperty(values, '0', { writable: false });
        try { values.copyWithin(0, 1); } catch {}
        values[0]('contract_hours_ledger');`,
      sort: `const values = [client.from, () => {}];
        Object.defineProperty(values, '0', { writable: false });
        try { values.sort(); } catch {}
        values[0]('contract_hours_ledger');`,
    };
    for (const [method, source] of Object.entries(cases)) {
      const observed = runtime(source);
      expect.soft(observed.thrown, `${method}/runtime`).toBeUndefined();
      expect.soft(analyze(source), `${method}/analysis`).toEqual({
        exact: observed.exact, unsupported: 0,
      });
    }
  });

  it('composes Round 20 switch, callback, and ambiguity completions', () => {
    const analyze = (source: string): { exact: number; unsupported: number } => {
      const discovered = discoverSupabaseCalls(source);
      return {
        exact: discovered.filter((call) => call.method === 'from' &&
          call.target === 'contract_hours_ledger').length,
        unsupported: discovered.filter((call) => call.unsupported).length,
      };
    };
    const exactCases = [
      `switch (1) {
         case 1:
           const marker = true;
         case 2:
           client.from('contract_hours_ledger');
           break;
       }`,
      `switch (3) {
         case 1: break;
         default: client.from('contract_hours_ledger');
       }`,
      `try {
         [0].forEach(() => { throw new Error('synthetic callback failure'); });
       } catch {}
       client.from('contract_hours_ledger');`,
      `function stop() { throw new Error('synthetic'); }
       try { stop(); }
       finally { client.from('contract_hours_ledger'); }`,
    ];
    exactCases.forEach((source) => {
      expect.soft(analyze(source), source).toEqual({ exact: 1, unsupported: 0 });
    });
    const inertCases = [
      `switch (3) {
         case 1: client.from('contract_hours_ledger'); break;
         case 2: break;
       }`,
      `[0].forEach(() => { throw new Error('synthetic callback failure'); });
       client.from('contract_hours_ledger');`,
    ];
    inertCases.forEach((source) => {
      expect.soft(analyze(source), source).toEqual({ exact: 0, unsupported: 0 });
    });
    const dynamic = `switch (externalDiscriminant) {
      case 0: client.from('contract_hours_ledger'); break;
      default: break;
    }`;
    expect(analyze(dynamic)).toEqual({ exact: 0, unsupported: 1 });
  });

  it('classifies composite ledger rows and column-opaque ledger DML', () => {
    expect(sqlDirectHoursUseCount(
      'SELECT l FROM public.contract_hours_ledger AS l;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT public.contract_hours_ledger FROM public.contract_hours_ledger;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'SELECT row_to_json(l) FROM public.contract_hours_ledger l;'
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      "UPDATE public.contract_hours_ledger AS l SET status = 'consumida' RETURNING l;"
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      "INSERT INTO public.contract_hours_ledger (status) VALUES ('reservada');"
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      "UPDATE public.contract_hours_ledger SET status = 'consumida';"
    )).toBe(1);
    expect(sqlDirectHoursUseCount(
      'DELETE FROM public.contract_hours_ledger WHERE false;'
    )).toBe(1);
    expect(() => sqlDirectHoursUseCount(
      'MERGE INTO public.contract_hours_ledger AS l USING incoming i ON false WHEN NOT MATCHED THEN DO NOTHING;'
    )).toThrow(/MERGE/);
    expect(sqlDirectHoursUseCount(`
      SELECT row_to_json(l),
             (SELECT outer_l FROM public.contract_hours_ledger outer_l WHERE outer_l.id = l.id)
        FROM public.contract_hours_ledger l;
    `)).toBe(2);
    expect(sqlDirectHoursUseCount(`
      SELECT (SELECT l FROM safe_rows l) FROM public.contract_hours_ledger l;
    `)).toBe(0);
    expect(sqlDirectHoursUseCount(
      "SELECT 'row_to_json(l) FROM contract_hours_ledger l'; -- RETURNING l\n"
    )).toBe(0);
  });

  it('distinguishes inert text from executable SQL and closes schema-object flows', () => {
    expect(sqlDirectHoursUseCount(`
      DO $body$ BEGIN
        EXECUTE 'SELECT hours FROM public.contract_hours_ledger';
      END $body$;
    `)).toBe(1);
    expect(sqlDirectHoursUseCount(`
      DO $body$ BEGIN
        EXECUTE 'SELECT ' || 'l.hours FROM public.contract_hours_ledger l';
      END $body$;
    `)).toBe(1);
    expect(sqlDirectHoursUseCount(`
      DO $body$ BEGIN
        EXECUTE format('SELECT hours FROM public.%I', 'contract_hours_ledger');
      END $body$;
    `)).toBe(1);
    expect(sqlDirectHoursUseCount(`
      DO $body$ BEGIN
        EXECUTE 'SELECT hours FROM public.contract_hours_ledger WHERE id = $1' USING ledger_id;
      END $body$;
    `)).toBe(1);
    expect(() => sqlDirectHoursUseCount(`
      DO $body$ BEGIN EXECUTE dynamic_sql; END $body$;
    `)).toThrow(/dynamic EXECUTE/);
    expect(() => sqlDirectHoursUseCount(`
      DO $body$ BEGIN
        EXECUTE format('SELECT hours FROM public.%I', dynamic_table);
      END $body$;
    `)).toThrow(/dynamic EXECUTE/);
    expect(sqlDirectHoursUseCount(`
      SELECT 'EXECUTE ''SELECT hours FROM contract_hours_ledger''' AS inert;
      -- EXECUTE 'SELECT hours FROM contract_hours_ledger';
    `)).toBe(0);

    for (const dependency of [
      `CREATE FUNCTION public.composite_arg(row_value public.contract_hours_ledger)
       RETURNS void LANGUAGE sql AS $$ SELECT $$;`,
      `CREATE FUNCTION public.composite_return() RETURNS public.contract_hours_ledger
       LANGUAGE sql AS $$ SELECT NULL $$;`,
      `DO $$ DECLARE ledger_row public.contract_hours_ledger%ROWTYPE; BEGIN NULL; END $$;`,
      `SELECT value::public.contract_hours_ledger FROM safe_rows;`,
      `CREATE TRIGGER ledger_guard AFTER UPDATE ON public.contract_hours_ledger
       REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
       FOR EACH STATEMENT EXECUTE FUNCTION public.audit_rows();`,
      `CREATE RULE ledger_redirect AS ON UPDATE TO public.contract_hours_ledger
       DO INSTEAD NOTHING;`,
    ]) {
      expect(() => sqlDirectHoursUseCount(dependency), dependency).toThrow(/ledger/);
    }

    expect(sqlDirectHoursUseCount(`
      CREATE VIEW public.synthetic_ledger_view AS
        SELECT l.hours FROM public.contract_hours_ledger l;
      CREATE MATERIALIZED VIEW public.synthetic_ledger_rollup AS
        SELECT sum(hours) AS hours FROM public.contract_hours_ledger;
    `)).toBe(2);
    expect(sqlDirectHoursUseCount(`
      WITH contract_hours_ledger AS (SELECT 1 AS hours)
      SELECT contract_hours_ledger.hours FROM contract_hours_ledger;
    `)).toBe(0);
    expect(sqlDirectHoursUseCount(`
      WITH contract_hours_ledger AS (SELECT 1 AS hours)
      SELECT public.contract_hours_ledger.hours
        FROM public.contract_hours_ledger;
    `)).toBe(1);
    expect(sqlDirectHoursUseCount(`
      SELECT lateral_rows.hours
        FROM safe_rows s
        CROSS JOIN LATERAL (
          SELECT l.hours FROM public.contract_hours_ledger l WHERE l.id = s.id
        ) lateral_rows;
    `)).toBe(2);
    expect(sqlDirectHoursUseCount(`
      SELECT (SELECT outer_l.hours WHERE outer_l.id = safe.id)
        FROM public.contract_hours_ledger AS outer_l, safe_rows AS safe;
    `)).toBe(1);
    expect(sqlDirectHoursUseCount(`
      SELECT "ledger row"."hours"
        FROM "public"."contract_hours_ledger" AS "ledger row";
    `)).toBe(1);
    expect(sqlDirectHoursUseCount(`
      DO $outer$ BEGIN
        EXECUTE $query$SELECT hours FROM public.contract_hours_ledger$query$;
      END $outer$;
    `)).toBe(1);
    expect(sqlDirectHoursUseCount(`
      DO $1$ BEGIN
        EXECUTE $query2$SELECT hours FROM public.contract_hours_ledger$query2$;
      END $1$;
    `)).toBe(1);

    for (const dependency of [
      `CREATE PROCEDURE public.consume_ledger(row_value public.contract_hours_ledger)
       LANGUAGE plpgsql AS $procedure$ BEGIN NULL; END $procedure$;`,
      `CREATE FUNCTION public.ledger_table_result()
       RETURNS TABLE (entry public.contract_hours_ledger)
       LANGUAGE sql AS $function$ SELECT NULL $function$;`,
      `DO $block$ DECLARE entry public.contract_hours_ledger; BEGIN NULL; END $block$;`,
      `CREATE OR REPLACE TRIGGER ledger_guard AFTER UPDATE ON public.contract_hours_ledger
       FOR EACH ROW EXECUTE FUNCTION public.audit_rows();`,
    ]) {
      expect(() => sqlDirectHoursUseCount(dependency), dependency).toThrow(/ledger/);
    }
    expect(sqlDirectHoursUseCount(`
      -- CREATE OR REPLACE TRIGGER inert ON public.contract_hours_ledger
      SELECT 'DECLARE entry public.contract_hours_ledger;';
    `)).toBe(0);
    expect(() => sqlDirectHoursUseCount(
      'DO $$ BEGIN EXECUTE runtime_target; END $$;',
      'supabase/migrations/20260803170000_add_email_marketing_tables.sql'
    )).toThrow(/dynamic EXECUTE/);
  });

  it('discovers a newly introduced production JS/JSX root', () => {
    const probeRoot = mkdtempSync(join(ROOT, 'future_z7_inventory_probe-'));
    const jsProbe = join(probeRoot, 'consumer.js');
    const jsxProbe = join(probeRoot, 'consumer.jsx');
    try {
      writeFileSync(jsProbe, "s.from('contract_hours_ledger').select('hours');\n");
      writeFileSync(jsxProbe, "export const C = () => <div>{s.from('contract_hours_ledger')}</div>;\n");
      expect(productionSourceFiles()).toEqual(expect.arrayContaining([jsProbe, jsxProbe]));
      expect(directTableTouchCount(readFileSync(jsProbe, 'utf8'))).toBe(1);
      expect(directTableTouchCount(readFileSync(jsxProbe, 'utf8'))).toBe(1);
    } finally {
      rmSync(probeRoot, { recursive: true, force: true });
    }
  });
});

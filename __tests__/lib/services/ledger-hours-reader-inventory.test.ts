// @vitest-environment node
/**
 * Z7-R5.2 — executable production inventory for direct and transitive ledger consumers.
 * New roots, table touches, RPCs/views/functions, SQL aliases, or dependency edges must
 * be explicitly classified here before the suite returns green.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
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

interface AbstractValue {
  strings: Set<string>;
  numbers: Set<number>;
  methods: Set<MethodName>;
  properties: Map<string, AbstractValue>;
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
  sequenceSource?: AbstractValue;
  sequenceMutation?: SequenceMutationName;
  sequenceMutationTarget?: AbstractValue;
}

function valueOf(partial: Partial<AbstractValue> = {}): AbstractValue {
  return {
    strings: partial.strings ?? new Set(),
    numbers: partial.numbers ?? new Set(),
    methods: partial.methods ?? new Set(),
    properties: partial.properties ?? new Map(),
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
    sequenceSource: partial.sequenceSource,
    sequenceMutation: partial.sequenceMutation,
    sequenceMutationTarget: partial.sequenceMutationTarget,
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
    result.external = left.external || right.external;
    result.callableCandidate = left.callableCandidate || right.callableCandidate;
    result.receiverProvenance = left.receiverProvenance === right.receiverProvenance
      ? left.receiverProvenance
      : left.receiverProvenance && right.receiverProvenance
        ? 'ambiguous'
        : left.receiverProvenance ?? right.receiverProvenance;

    const propertyNames = new Set([...left.properties.keys(), ...right.properties.keys()]);
    for (const name of propertyNames) {
      const leftProperty = left.properties.get(name);
      const rightProperty = right.properties.get(name);
      result.properties.set(name, leftProperty && rightProperty
        ? pair(leftProperty, rightProperty)
        : leftProperty ?? rightProperty!);
    }
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
    if (left.sequenceBuilder && right.sequenceBuilder &&
        left.sequenceBuilder !== right.sequenceBuilder) {
      result.external = true;
      result.callableCandidate = true;
    } else {
      result.sequenceBuilder = left.sequenceBuilder ?? right.sequenceBuilder;
      result.sequenceSource = left.sequenceSource && right.sequenceSource
        ? pair(left.sequenceSource, right.sequenceSource)
        : left.sequenceSource ?? right.sequenceSource;
    }
    if (left.sequenceMutation && right.sequenceMutation &&
        left.sequenceMutation !== right.sequenceMutation) {
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
  const calls: DiscoveredCall[] = [];
  const activeFunctions = new Set<ts.FunctionLikeDeclaration>();
  const functionInputs = new Map<ts.FunctionLikeDeclaration, AbstractValue[]>();
  const functionOutputs = new Map<ts.FunctionLikeDeclaration, AbstractValue>();
  const functionClosures = new Map<ts.FunctionLikeDeclaration, Map<string, AbstractValue>>();
  const functionStack: ts.FunctionLikeDeclaration[] = [];
  type ReceiverProvenance = NonNullable<AbstractValue['receiverProvenance']>;
  const moduleExportCache = new Map<string, Map<string, ReceiverProvenance>>();
  const activeModuleExports = new Set<string>();

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

  function reflectValue(): AbstractValue {
    return valueOf({ properties: new Map([
      ['apply', valueOf({ adapter: 'reflectApply', callableCandidate: true })],
    ]) });
  }

  function functionConstructorValue(): AbstractValue {
    return valueOf({ properties: new Map([
      ['prototype', valueOf({ properties: new Map([
        ['call', valueOf({ adapter: 'call', callableCandidate: true })],
        ['apply', valueOf({ adapter: 'apply', callableCandidate: true })],
        ['bind', valueOf({ adapter: 'bind', callableCandidate: true })],
      ]) })],
    ]) });
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
    return valueOf({
      properties,
      tupleElements,
      elements: candidates.length > 0 ? unionValues(...candidates) : extraElements,
      external,
      callableCandidate: external && candidates.some((entry) => isDatabaseCallable(entry)),
    });
  }

  function arrayConstructorValue(): AbstractValue {
    return valueOf({
      sequenceBuilder: 'constructor',
      callableCandidate: true,
      receiverProvenance: 'non-database',
      properties: new Map([
        ['of', valueOf({ sequenceBuilder: 'of', callableCandidate: true })],
        ['from', valueOf({ sequenceBuilder: 'from', callableCandidate: true })],
      ]),
    });
  }

  function classValue(node: ts.ClassLikeDeclaration): AbstractValue {
    const properties = new Map<string, AbstractValue>();
    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const name = readPropertyName(member.name);
      if (name) properties.set(name, functionValue(member));
    }
    return valueOf({ properties });
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
    if (activeModuleExports.has(targetPath)) return new Map([['*', 'ambiguous']]);
    activeModuleExports.add(targetPath);

    let exports = new Map<string, ReceiverProvenance>();
    const locals = new Map<string, ReceiverProvenance>();
    const localObjects = new Map<string, Map<string, ReceiverProvenance>>();
    const localStrings = new Map<string, string>();
    let exportsAlias = true;
    let reboundExports = new Map<string, ReceiverProvenance>();
    let sawCommonJsExport = false;
    const target = ts.createSourceFile(targetPath, readFileSync(targetPath, 'utf8'),
      ts.ScriptTarget.Latest, true,
      /x$/.test(targetPath) ? ts.ScriptKind.TSX
        : /\.[cm]?js$/.test(targetPath) ? ts.ScriptKind.JS : ts.ScriptKind.TS);

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
    ): ReceiverProvenance => [...graph.entries()]
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
    function expressionMembers(
      expression: ts.Expression | undefined,
      seen = new Set<ts.Node>()
    ): Map<string, ReceiverProvenance> | undefined {
      if (!expression || seen.has(expression)) return undefined;
      seen.add(expression);
      const current = ts.isParenthesizedExpression(expression) ? expression.expression : expression;
      if (ts.isIdentifier(current)) {
        if (current.text === 'exports') return exportsAlias ? exports : reboundExports;
        return localObjects.get(current.text);
      }
      if (ts.isPropertyAccessExpression(current) &&
          ts.isIdentifier(current.expression) && current.expression.text === 'module' &&
          current.name.text === 'exports') return exports;
      if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) &&
          current.expression.text === 'require' && ts.isStringLiteralLike(current.arguments[0])) {
        return new Map(moduleExports(current.arguments[0].text, targetPath));
      }
      if (ts.isObjectLiteralExpression(current)) {
        const members = new Map<string, ReceiverProvenance>();
        for (const property of current.properties) {
          if (ts.isSpreadAssignment(property)) {
            const spread = expressionMembers(property.expression, new Set(seen));
            if (!spread) members.set('*', 'ambiguous');
            else for (const [name, provenance] of spread) {
              if (name !== 'default') members.set(name, mergeProvenance(
                members.get(name), provenance
              ));
            }
            continue;
          }
          if (ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property)) {
            const name = staticName(property.name);
            members.set(name ?? '*', 'ambiguous');
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
          members.set(name, mergeProvenance(members.get(name), provenance));
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
        return members?.get(current.name.text) ?? expressionProvenance(current.expression, seen);
      }
      if (ts.isElementAccessExpression(current)) {
        const members = expressionMembers(current.expression, new Set(seen));
        const name = staticName(current.argumentExpression, true);
        return (name ? members?.get(name) : undefined) ??
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

    for (const statement of target.statements) {
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
      exports = value.members ? new Map(value.members) : new Map();
      exports.set('default', mergeProvenance(exports.get('default'), value.provenance));
    };
    const mergeStaticMembers = (
      destination: Map<string, ReceiverProvenance>,
      source: Map<string, ReceiverProvenance> | undefined
    ): void => {
      if (!source) {
        destination.set('*', 'ambiguous');
        return;
      }
      for (const [name, provenance] of source) {
        if (name === 'default') continue;
        destination.set(name, mergeProvenance(destination.get(name), provenance));
      }
    };
    function applyCommonAssignment(assignment: ts.BinaryExpression): ExportValue {
      const value = exportValue(assignment.right);
      if (isModuleExports(assignment.left)) {
        sawCommonJsExport = true;
        replaceModuleExports(value);
        exportsAlias = false;
        return { ...value, members: exports, moduleObject: true };
      }
      if (ts.isIdentifier(assignment.left) && assignment.left.text === 'exports') {
        sawCommonJsExport = true;
        reboundExports = value.members ? value.members : new Map([
          ['default', value.provenance],
        ]);
        exportsAlias = Boolean(value.moduleObject);
        if (exportsAlias) reboundExports = exports;
        return { ...value, members: reboundExports, moduleObject: exportsAlias };
      }
      const member = commonMemberTarget(assignment.left);
      if (member) {
        sawCommonJsExport = true;
        const destination = member.owner === 'module'
          ? exports : exportsAlias ? exports : reboundExports;
        destination.set(member.name ?? '*', member.name
          ? mergeProvenance(destination.get(member.name), value.provenance)
          : 'ambiguous');
      }
      return value;
    }
    for (const statement of target.statements) {
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
      } else if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
          ts.isPropertyAccessExpression(statement.expression.expression) &&
          ts.isIdentifier(statement.expression.expression.expression) &&
          statement.expression.expression.expression.text === 'Object' &&
          statement.expression.expression.name.text === 'assign') {
        const call = statement.expression;
        const destination = call.arguments[0];
        const writesModule = destination && isModuleExports(destination);
        const writesExports = destination && ts.isIdentifier(destination) &&
          destination.text === 'exports';
        if (writesModule || writesExports) {
          sawCommonJsExport = true;
          const output = writesModule ? exports : exportsAlias ? exports : reboundExports;
          call.arguments.slice(1).forEach((argument) =>
            mergeStaticMembers(output, expressionMembers(argument))
          );
        }
      }
    }
    if (sawCommonJsExport) {
      for (const [name, provenance] of [...exports]) {
        if (name !== '*' && name !== 'default' && !name.startsWith('default.')) {
          exports.set(`default.${name}`, provenance);
        }
      }
    }
    const aggregate = [...exports.values()].reduce<ReceiverProvenance | undefined>(
      (result, provenance) => mergeProvenance(result, provenance), undefined
    );
    exports.set('*', aggregate ?? 'ambiguous');
    activeModuleExports.delete(targetPath);
    moduleExportCache.set(targetPath, exports);
    return exports;
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
        if (name === '*' || (prefix === '' && name === 'default')) continue;
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
            : localModule ? 'ambiguous' : graph.get('*') ?? importProvenance(moduleName));
      return valueOf({
        properties,
        receiverProvenance,
        external: receiverProvenance === 'ambiguous',
      });
    };
    return graphValue(importedName === '*' ? '' : importedName);
  }

  function selectedProperty(base: AbstractValue, property: string): AbstractValue {
    const stored = base.properties.get(property);
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
      if (node.text === 'Buffer') {
        return valueOf({ receiverProvenance: 'non-database' });
      }
      return valueOf({ external: true });
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
      const properties = new Map<string, AbstractValue>();
      let external = false;
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = resolveValue(property.expression);
          external ||= spread.external;
          for (const [name, spreadValue] of spread.properties) {
            properties.set(name, properties.has(name)
              ? unionValues(properties.get(name)!, spreadValue) : spreadValue);
          }
        } else if (ts.isPropertyAssignment(property)) {
          const name = readPropertyName(property.name);
          if (name) properties.set(name, resolveValue(property.initializer));
        } else if (ts.isShorthandPropertyAssignment(property)) {
          properties.set(property.name.text, resolveValue(property.name));
        } else if (ts.isMethodDeclaration(property)) {
          const name = readPropertyName(property.name);
          if (name) properties.set(name, functionValue(property));
        }
      }
      return valueOf({ properties, external });
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'Object' && node.expression.name.text === 'assign') {
      return resolveValue(node.arguments[0]);
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require' &&
          ts.isStringLiteralLike(node.arguments[0])) {
        return importedValue(node.arguments[0].text, '*');
      }
      const callable = resolveValue(node.expression);
      return evaluateCallable(
        callable,
        invocationArgumentValues(node.arguments),
        undefined,
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
      Boolean(value.sequenceSource);
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
        scopes[index].set(name, unionValues(scopes[index].get(name)!, value));
        return;
      }
    }
    scopes[scopes.length - 1].set(name, valueOf({ external: true }));
  }

  function writeSequencePosition(base: AbstractValue, index: number, value: AbstractValue): void {
    if (!Number.isInteger(index) || index < 0 || index > 4096) {
      base.external = true;
      base.elements = base.elements ? unionValues(base.elements, value) : value;
      return;
    }
    const tuple = base.tupleElements ?? [];
    while (tuple.length <= index) tuple.push(valueOf());
    tuple[index] = hasAbstractFacts(tuple[index]) ? unionValues(tuple[index], value) : value;
    base.tupleElements = tuple;
    base.properties.set(String(index), tuple[index]);
    base.properties.set('length', valueOf({ numbers: new Set([tuple.length]) }));
    base.elements = base.elements ? unionValues(base.elements, value) : value;
  }

  function assignPattern(name: ts.Expression, value: AbstractValue): void {
    const target = unwrap(name);
    if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      assignPattern(target.left, applyBindingDefault(value, target.right, hasAbstractFacts(value)));
      return;
    }
    if (ts.isSpreadElement(target)) {
      assignPattern(target.expression, value);
      return;
    }
    if (ts.isIdentifier(target)) {
      assign(target.text, value);
      return;
    }
    if (ts.isPropertyAccessExpression(target)) {
      const base = resolveValue(target.expression);
      const prior = base.properties.get(target.name.text);
      base.properties.set(target.name.text, prior ? unionValues(prior, value) : value);
      return;
    }
    if (ts.isElementAccessExpression(target)) {
      const base = resolveValue(target.expression);
      const keys = resolveValue(target.argumentExpression);
      if (keys.external || (keys.strings.size === 0 && keys.numbers.size === 0)) {
        base.external = true;
        base.elements = base.elements ? unionValues(base.elements, value) : value;
        return;
      }
      for (const index of keys.numbers) writeSequencePosition(base, index, value);
      for (const key of keys.strings) {
        if (/^(?:0|[1-9]\d*)$/.test(key)) {
          writeSequencePosition(base, Number(key), value);
          continue;
        }
        const prior = base.properties.get(key);
        base.properties.set(key, prior ? unionValues(prior, value) : value);
      }
      return;
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
      return;
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
  }

  function receiverExcluded(expression: ts.Expression): boolean {
    const text = expression.getText(sf);
    return text === 'Buffer' ||
      /\.storage\b/.test(text) || /\.registry\b/.test(text) || /\.query\b/.test(text);
  }

  function withScope(run: () => void): void {
    scopes.push(new Map());
    try { run(); } finally { scopes.pop(); }
  }

  function valueFingerprint(value: AbstractValue, seen = new Set<AbstractValue>()): string {
    if (seen.has(value)) return '<cycle>';
    seen.add(value);
    const properties = [...value.properties.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, entry]) => `${name}:${valueFingerprint(entry, seen)}`);
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
      sequenceSource: value.sequenceSource ? valueFingerprint(value.sequenceSource, seen) : null,
      sequenceMutation: value.sequenceMutation ?? null,
      sequenceMutationTarget: value.sequenceMutationTarget
        ? valueFingerprint(value.sequenceMutationTarget, seen) : null,
      properties, elements: value.elements ? valueFingerprint(value.elements, seen) : null,
      tupleElements: value.tupleElements?.map((entry) => valueFingerprint(entry, seen)) ?? null,
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
      sequenceSource: callable.sequenceSource,
      sequenceMutation: callable.sequenceMutation,
      sequenceMutationTarget: callable.sequenceMutationTarget,
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
    target.tupleElements = entries;
    target.elements = entries.length > 0 ? unionValues(...entries) : undefined;
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
    target.tupleElements = undefined;
    const uncertainty = valueOf({ external: true, callableCandidate: executable });
    target.elements = candidates.length > 0
      ? unionValues(...candidates, uncertainty) : uncertainty;
    target.external = true;
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
    context: InvocationContext
  ): AbstractValue {
    const target = callable.sequenceMutationTarget ?? valueOf({
      external: true, callableCandidate: true,
    });
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

    if (method === 'push') {
      entries.push(...args);
      refreshSequence(target, entries);
      result = valueOf({ numbers: new Set([entries.length]) });
    } else if (method === 'pop') {
      result = entries.pop() ?? valueOf();
      refreshSequence(target, entries);
    } else if (method === 'shift') {
      result = entries.shift() ?? valueOf();
      refreshSequence(target, entries);
    } else if (method === 'unshift') {
      entries.unshift(...args);
      refreshSequence(target, entries);
      result = valueOf({ numbers: new Set([entries.length]) });
    } else if (method === 'reverse') {
      entries.reverse();
      refreshSequence(target, entries);
      result = target;
    } else if (method === 'splice') {
      if (args.length === 0) {
        refreshSequence(target, entries);
        result = coherentSequence([]);
        sequenceMutationResults.set(context.node, {
          target, result, postState: valueFingerprint(target),
        });
        return result;
      }
      const startNumber = exactNumber(args[0]);
      const deleteNumber = args.length < 2 ? entries.length : exactNumber(args[1]);
      if (startNumber === undefined || deleteNumber === undefined) {
        invalidateSequence(target, args);
        result = coherentSequence([], true, target.elements);
      } else {
        const start = relativeIndex(startNumber, entries.length);
        const deleteCount = args.length < 2
          ? entries.length - start
          : Math.min(Math.max(Math.trunc(deleteNumber), 0), entries.length - start);
        const removed = entries.splice(start, deleteCount, ...args.slice(2));
        refreshSequence(target, entries);
        result = coherentSequence(removed);
      }
    } else if (method === 'fill') {
      const startNumber = args.length < 2 ? 0 : exactNumber(args[1]);
      const endNumber = args.length < 3 ? entries.length : exactNumber(args[2]);
      if (startNumber === undefined || endNumber === undefined) {
        invalidateSequence(target, args);
        result = target;
      } else {
        entries.fill(
          args[0] ?? valueOf(),
          relativeIndex(startNumber, entries.length),
          relativeIndex(endNumber, entries.length)
        );
        refreshSequence(target, entries);
        result = target;
      }
    } else if (method === 'copyWithin') {
      const targetNumber = exactNumber(args[0]);
      const startNumber = exactNumber(args[1]);
      const endNumber = args.length < 3 ? entries.length : exactNumber(args[2]);
      if (targetNumber === undefined || startNumber === undefined || endNumber === undefined) {
        invalidateSequence(target, args);
        result = target;
      } else {
        const destination = relativeIndex(targetNumber, entries.length);
        const start = relativeIndex(startNumber, entries.length);
        const end = relativeIndex(endNumber, entries.length);
        const copied = entries.slice(start, Math.max(start, end));
        copied.slice(0, Math.max(entries.length - destination, 0))
          .forEach((entry, index) => { entries[destination + index] = entry; });
        refreshSequence(target, entries);
        result = target;
      }
    } else {
      invalidateSequence(target, args);
      result = target;
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
    const invocationReceiver = receiver ?? initialCallable.boundReceiver;
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
      return evaluateSequenceMutation(callable, args, context);
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
      invokeFunction(target, parameterValues(target, args))
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
    const merged = target.parameters.map((_, index) =>
      prior[index] ? unionValues(prior[index], values[index] ?? valueOf()) : values[index] ?? valueOf()
    );
    const changed = merged.some((entry, index) =>
      valueFingerprint(entry) !== valueFingerprint(prior[index] ?? valueOf())
    );
    if (changed || !functionInputs.has(target)) functionInputs.set(target, merged);
    return changed;
  }

  function invokeFunction(
    target: ts.FunctionLikeDeclaration,
    values: AbstractValue[]
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
    do {
      before = (functionInputs.get(target) ?? []).map((entry) => valueFingerprint(entry)).join('|');
      withScope(() => {
        for (const [name, value] of functionClosures.get(target) ?? []) {
          scopes[scopes.length - 1].set(name, value);
        }
        const inputs = functionInputs.get(target) ?? [];
        target.parameters.forEach((parameter, index) =>
          declareName(parameter.name, parameter.initializer, inputs[index])
        );
        activeFunctions.add(target);
        functionStack.push(target);
        try {
          if (target.body && ts.isArrowFunction(target) && !ts.isBlock(target.body)) {
            const output = resolveValue(target.body);
            functionOutputs.set(target, functionOutputs.has(target)
              ? unionValues(functionOutputs.get(target)!, output)
              : output);
            visit(target.body);
          } else if (target.body) {
            visit(target.body);
          }
        } finally {
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
    } while (before !== (functionInputs.get(target) ?? [])
      .map((entry) => valueFingerprint(entry)).join('|'));
    return functionOutputs.get(target) ?? valueOf();
  }

  function visitStatements(statements: ts.NodeArray<ts.Statement>): void {
    for (const statement of statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        scopes[scopes.length - 1].set(statement.name.text, valueOf({
          functions: new Set([statement]), callableCandidate: true,
        }));
      } else if (ts.isClassDeclaration(statement) && statement.name) {
        scopes[scopes.length - 1].set(statement.name.text, classValue(statement));
      }
    }
    statements.forEach(visit);
  }

  function visit(node: ts.Node): void {
    if (ts.isSourceFile(node)) {
      visitStatements(node.statements);
      return;
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause) return;
      const moduleName = node.moduleSpecifier.text;
      const scope = scopes[scopes.length - 1];
      if (clause.name) scope.set(clause.name.text, importedValue(moduleName, 'default'));
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          scope.set(clause.namedBindings.name.text, importedValue(moduleName, '*'));
        } else {
          for (const specifier of clause.namedBindings.elements) {
            scope.set(specifier.name.text, importedValue(
              moduleName,
              specifier.propertyName?.text ?? specifier.name.text
            ));
          }
        }
      }
      return;
    }
    if (ts.isBlock(node) && node !== sf) {
      withScope(() => visitStatements(node.statements));
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      scopes[scopes.length - 1].set(node.name.text, valueOf({
        functions: new Set([node]), callableCandidate: true,
      }));
      invokeFunction(node, node.parameters.map(() => valueOf()));
      return;
    }
    if (ts.isClassDeclaration(node) && node.name) {
      scopes[scopes.length - 1].set(node.name.text, classValue(node));
      return;
    }
    if (ts.isFunctionLike(node)) {
      invokeFunction(node, node.parameters.map(() => valueOf()));
      return;
    }
    if (ts.isReturnStatement(node)) {
      const target = functionStack.at(-1);
      if (target && node.expression) {
        const output = resolveValue(node.expression);
        functionOutputs.set(target, functionOutputs.has(target)
          ? unionValues(functionOutputs.get(target)!, output)
          : output);
        visit(node.expression);
      }
      return;
    }
    if (ts.isForOfStatement(node)) {
      visit(node.expression);
      const iterable = resolveValue(node.expression);
      withScope(() => {
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
        visit(node.statement);
      });
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      if (!node.name) return;
      if (node.initializer) visit(node.initializer);
      declareName(node.name, node.initializer);
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      visit(node.right);
      assignPattern(node.left, resolveValue(node.right));
      return;
    }
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Object' && node.expression.name.text === 'assign') {
        const target = resolveValue(node.arguments[0]);
        for (const argument of node.arguments.slice(1)) {
          const sourceValue = resolveValue(argument);
          target.external ||= sourceValue.external;
          for (const [name, assigned] of sourceValue.properties) {
            target.properties.set(name, target.properties.has(name)
              ? unionValues(target.properties.get(name)!, assigned) : assigned);
          }
        }
        node.arguments.forEach(visit);
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          ((node.expression.expression.text === 'Object' &&
            node.expression.name.text === 'defineProperty') ||
           (node.expression.expression.text === 'Reflect' && node.expression.name.text === 'set'))) {
        const target = resolveValue(node.arguments[0]);
        const keys = resolveValue(node.arguments[1]);
        const rawValue = node.expression.expression.text === 'Reflect'
          ? resolveValue(node.arguments[2])
          : resolveValue(node.arguments[2]).properties.get('value') ??
            valueOf({ external: true, callableCandidate: true });
        if (keys.external || keys.strings.size === 0) {
          target.external = true;
          for (const [name, prior] of target.properties) {
            target.properties.set(name, unionValues(prior,
              valueOf({ external: true, callableCandidate: true })));
          }
        } else {
          for (const key of keys.strings) {
            target.properties.set(key, target.properties.has(key)
              ? unionValues(target.properties.get(key)!, rawValue) : rawValue);
          }
        }
        node.arguments.forEach(visit);
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
        for (const target of callback.functions) {
          invokeFunction(target, parameterValues(target, callbackArguments));
        }
        if (callback.external && callback.callableCandidate) {
          calls.push({
            method: 'unknown', unsupported: 'dynamic callable name',
            expression: node.arguments[0]?.getText(sf) ?? '<missing callback>',
            position: node.pos,
          });
        }
        node.arguments.slice(1).forEach(visit);
        return;
      }

      if (ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.name.text === 'from' || node.expression.name.text === 'rpc') &&
          receiverExcluded(node.expression.expression)) {
        node.arguments.forEach(visit);
        return;
      }

      const callable = resolveValue(node.expression);
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
      evaluateCallable(
        callable,
        invocationArgumentValues(node.arguments),
        undefined,
        {
          record: true,
          node,
          expression: node.expression.getText(sf),
          targetExpression: node.arguments[0]?.getText(sf),
        }
      );
    }
    ts.forEachChild(node, visit);
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
    expect(objectMutation[0].dynamicValues).toEqual(['contract_hours_ledger', 'safe_a']);
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

      for (const source of [
        `const api = require('./bare-rebind');
         api.makeDatabase().from('contract_hours_ledger');`,
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

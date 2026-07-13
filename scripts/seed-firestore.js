import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { loadOfficialCatalogs } from './lib/official-catalog.js';
import { buildSeedDocuments } from './lib/seed-documents.js';
import { createSeedPlan } from './lib/seed-plan.js';

const DEFAULT_PROJECT = 'demo-pghs-hts';
const DEFAULT_EMULATOR_HOST = '127.0.0.1:8080';

function readValue(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} 뒤에 값이 필요합니다.`);
  }
  return value;
}

export function parseSeedArguments(args) {
  const options = {
    projectId: DEFAULT_PROJECT,
    dryRun: false,
    force: false,
    live: false,
    confirmProject: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--project') {
      options.projectId = readValue(args, index, argument);
      index += 1;
    } else if (argument === '--confirm-project') {
      options.confirmProject = readValue(args, index, argument);
      index += 1;
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--force') {
      options.force = true;
    } else if (argument === '--live') {
      options.live = true;
    } else {
      throw new Error(`알 수 없는 옵션: ${argument}`);
    }
  }

  if (!options.projectId.trim()) {
    throw new Error('대상 프로젝트 ID가 비어 있습니다.');
  }
  if (options.live && options.projectId.startsWith('demo-')) {
    throw new Error('demo 프로젝트를 --live 대상으로 지정할 수 없습니다.');
  }
  if (options.live && options.confirmProject !== options.projectId) {
    throw new Error(`운영 실행은 --confirm-project ${options.projectId} 재확인이 필요합니다.`);
  }
  if (!options.live && options.confirmProject) {
    throw new Error('--confirm-project는 --live와 함께만 사용할 수 있습니다.');
  }

  return options;
}

async function findExistingPaths(database, documents) {
  const snapshots = await database.getAll(...documents.map(({ path: documentPath }) => database.doc(documentPath)));
  return snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.ref.path);
}

async function run() {
  const options = parseSeedArguments(process.argv.slice(2));
  if (options.live && process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('--live 실행 전 FIRESTORE_EMULATOR_HOST를 해제해야 합니다.');
  }
  if (!options.live) {
    process.env.FIRESTORE_EMULATOR_HOST ||= DEFAULT_EMULATOR_HOST;
  }

  const target = options.live ? 'LIVE FIRESTORE' : `Emulator ${process.env.FIRESTORE_EMULATOR_HOST}`;
  console.log(`대상 프로젝트: ${options.projectId}`);
  console.log(`실행 대상: ${target}`);
  console.log(`실행 모드: ${options.dryRun ? 'dry-run' : 'write'}, force=${options.force}`);

  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { clubs, etfs } = await loadOfficialCatalogs(repositoryRoot);
  const documents = buildSeedDocuments({ clubs, etfs, now: Timestamp.now() });

  const appOptions = { projectId: options.projectId };
  if (options.live) {
    appOptions.credential = applicationDefault();
  }
  const app = initializeApp(appOptions, `official-seed-${Date.now()}`);

  try {
    const database = getFirestore(app);
    const existingPaths = await findExistingPaths(database, documents);
    const plan = createSeedPlan(documents, existingPaths, options);

    if (!options.dryRun && plan.operations.length > 0) {
      const batch = database.batch();
      for (const operation of plan.operations) {
        const reference = database.doc(operation.path);
        if (operation.type === 'create') {
          batch.create(reference, operation.data);
        } else {
          batch.update(reference, operation.data);
        }
      }
      await batch.commit();
    }

    console.log(`결과: 생성 ${plan.counts.created}, 건너뜀 ${plan.counts.skipped}, 갱신 ${plan.counts.updated}, 실패 0`);
    if (options.dryRun) {
      console.log('dry-run이므로 Firestore에 쓰지 않았습니다.');
    }
  } catch (error) {
    console.error(`시드 실패: ${error.message}`);
    console.error('단일 atomic batch를 사용하므로 이 실행의 계획된 쓰기는 부분 반영되지 않습니다.');
    process.exitCode = 1;
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(`시드 시작 실패: ${error.message}`);
    process.exitCode = 1;
  });
}

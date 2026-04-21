import { MENU_BUTTONS } from '../../utils/constants.js';
import { getMainMenuKeyboard } from '../keyboards/mainMenu.js';

export const SCENE_EXIT_REASONS = Object.freeze({
  SAVE: 'save',
  BACK: 'back',
  GLOBAL_NAVIGATION: 'global_navigation',
  CANCEL: 'cancel',
  UNSPECIFIED: 'unspecified',
});

const SCENE_META_KEY = '__sceneNavigation';
const SCENE_SESSION_RESET_MESSAGE = 'Сессия была сброшена';
const GLOBAL_NAVIGATION_COMMANDS = new Set([
  '/admin',
  '/start',
  '/booking',
  '/registration',
  '/menu',
  '/help',
]);
const GLOBAL_NAVIGATION_TEXTS = new Set([
  MENU_BUTTONS.REGISTRATION,
  MENU_BUTTONS.MY_DATA,
  MENU_BUTTONS.BOOKING,
  MENU_BUTTONS.TAKE_ITEMS,
  MENU_BUTTONS.RETURN_ITEMS,
  MENU_BUTTONS.MY_BOOKINGS,
  MENU_BUTTONS.MAIN_MENU,
  MENU_BUTTONS.HELP,
]);

function getMessageText(ctx) {
  return ctx.message?.text?.trim() ?? '';
}

function getRequestLogger(ctx) {
  return ctx.state?.requestLogger ?? null;
}

function ensureSession(ctx) {
  ctx.session ??= {};
}

function getSceneSession(ctx) {
  return ctx.session?.__scenes ?? null;
}

function getSceneMeta(ctx) {
  const sceneSession = getSceneSession(ctx);

  if (!sceneSession) {
    return null;
  }

  sceneSession.state ??= {};
  sceneSession.state[SCENE_META_KEY] ??= {};
  return sceneSession.state[SCENE_META_KEY];
}

function clearSceneMeta(ctx) {
  const sceneSession = getSceneSession(ctx);

  if (!sceneSession?.state?.[SCENE_META_KEY]) {
    return;
  }

  delete sceneSession.state[SCENE_META_KEY];

  if (Object.keys(sceneSession.state).length === 0) {
    delete sceneSession.state;
  }
}

function getActiveSceneId(ctx) {
  return ctx.scene?.current?.id ?? getSceneSession(ctx)?.current ?? null;
}

function hasSceneSessionData(ctx) {
  const sceneSession = getSceneSession(ctx);

  if (!sceneSession) {
    return false;
  }

  const hasCurrent = sceneSession.current !== undefined && sceneSession.current !== null;
  const hasExpiry = sceneSession.expires !== undefined && sceneSession.expires !== null;
  const hasState = Boolean(sceneSession.state && Object.keys(sceneSession.state).length > 0);

  return hasCurrent || hasExpiry || hasState;
}

function hasWizardStateData(ctx) {
  const state = ctx.wizard?.state;

  if (!state || typeof state !== 'object') {
    return false;
  }

  return Object.keys(state).some((key) => key !== SCENE_META_KEY);
}

export function createSceneSessionGuard() {
  return async (ctx, next) => {
    ensureSession(ctx);

    if (!ctx.wizard || ctx.wizard.cursor === 0 || hasWizardStateData(ctx)) {
      return next();
    }

    getRequestLogger(ctx)?.warn(
      {
        cursor: ctx.wizard.cursor,
        sceneId: getActiveSceneId(ctx),
      },
      'Scene wizard state is empty',
    );

    await leaveActiveScene(ctx, {
      forceReset: true,
      reason: SCENE_EXIT_REASONS.CANCEL,
    });
    await ctx.reply(SCENE_SESSION_RESET_MESSAGE, getMainMenuKeyboard());

    return undefined;
  };
}

function getGlobalNavigationIntent(ctx) {
  const text = getMessageText(ctx);

  if (!text) {
    return null;
  }

  const command = text.split(/\s+/u, 1)[0].toLowerCase().replace(/@.+$/u, '');

  if (GLOBAL_NAVIGATION_COMMANDS.has(command)) {
    return {
      kind: 'command',
      value: command,
    };
  }

  if (GLOBAL_NAVIGATION_TEXTS.has(text)) {
    return {
      kind: 'text',
      value: text,
    };
  }

  return null;
}

async function shouldInterruptSceneForNavigation(ctx, navigationIntent) {
  if (!navigationIntent) {
    return false;
  }

  if (navigationIntent.kind === 'command' && navigationIntent.value === '/admin') {
    const adminService = ctx.state?.services?.adminService;

    if (!adminService || !ctx.from?.id) {
      return false;
    }

    const admin = await adminService.getAdminByActorId(ctx.from.id);
    return Boolean(admin);
  }

  return true;
}

function consumeSceneExitReason(ctx) {
  const sceneMeta = getSceneMeta(ctx);
  const exitReason = sceneMeta?.exitReason ?? SCENE_EXIT_REASONS.UNSPECIFIED;

  clearSceneMeta(ctx);
  return exitReason;
}

export function markSceneExitReason(ctx, reason) {
  const sceneMeta = getSceneMeta(ctx);

  if (!sceneMeta) {
    return;
  }

  sceneMeta.exitReason = reason;
}

export function attachSceneLifecycleLogging(scene) {
  scene.enter(async (ctx, next) => {
    ensureSession(ctx);

    getRequestLogger(ctx)?.info(
      {
        callbackData: ctx.callbackQuery?.data ?? null,
        messageText: getMessageText(ctx) || null,
        sceneId: scene.id,
        updateType: ctx.state?.updateType ?? null,
      },
      'Scene entered',
    );

    return next();
  });

  scene.use(createSceneSessionGuard());

  scene.leave(async (ctx, next) => {
    getRequestLogger(ctx)?.info(
      {
        exitReason: consumeSceneExitReason(ctx),
        sceneId: scene.id,
        updateType: ctx.state?.updateType ?? null,
      },
      'Scene left',
    );

    return next();
  });

  return scene;
}

export async function leaveActiveScene(
  ctx,
  {
    forceReset = false,
    reason = SCENE_EXIT_REASONS.CANCEL,
  } = {},
) {
  const activeSceneId = getActiveSceneId(ctx);

  if (!activeSceneId) {
    if (forceReset && hasSceneSessionData(ctx)) {
      ctx.scene?.reset?.();
      getRequestLogger(ctx)?.warn(
        {
          reason,
          sceneId: getSceneSession(ctx)?.current ?? null,
        },
        'Scene session reset without active scene instance',
      );
      return true;
    }

    return false;
  }

  markSceneExitReason(ctx, reason);

  try {
    await ctx.scene.leave();
  } catch (error) {
    if (!forceReset) {
      throw error;
    }

    getRequestLogger(ctx)?.error(
      {
        err: error,
        reason,
        sceneId: activeSceneId,
      },
      'Scene leave failed, forcing reset',
    );

    ctx.scene?.reset?.();
    return true;
  }

  if (forceReset && hasSceneSessionData(ctx)) {
    ctx.scene?.reset?.();
  }

  return true;
}

export async function resetSceneSession(
  ctx,
  {
    logMessage = 'Scene session reset',
    reason = SCENE_EXIT_REASONS.CANCEL,
  } = {},
) {
  const activeSceneId = getActiveSceneId(ctx);

  if (activeSceneId) {
    return leaveActiveScene(ctx, {
      forceReset: true,
      reason,
    });
  }

  if (!hasSceneSessionData(ctx)) {
    return false;
  }

  const staleSceneId = getSceneSession(ctx)?.current ?? null;

  ctx.scene?.reset?.();
  getRequestLogger(ctx)?.warn(
    {
      reason,
      sceneId: staleSceneId,
    },
    logMessage,
  );

  return true;
}

export function createGlobalSceneNavigationGuard() {
  return async (ctx, next) => {
    const activeSceneId = getActiveSceneId(ctx);
    const navigationIntent = getGlobalNavigationIntent(ctx);

    if (!activeSceneId || !navigationIntent) {
      return next();
    }

    if (!(await shouldInterruptSceneForNavigation(ctx, navigationIntent))) {
      return next();
    }

    getRequestLogger(ctx)?.info(
      {
        navigationKind: navigationIntent.kind,
        navigationValue: navigationIntent.value,
        sceneId: activeSceneId,
      },
      'Global navigation interrupted active scene',
    );

    await leaveActiveScene(ctx, {
      forceReset: true,
      reason: SCENE_EXIT_REASONS.GLOBAL_NAVIGATION,
    });

    return next();
  };
}

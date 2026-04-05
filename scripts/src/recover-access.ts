import { chromium, type Locator, type Page } from "playwright";

const MEE_FORGOT_PASSWORD_URL =
  "https://identity.macmillaneducationeverywhere.com/forgot-password?returnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3D21%26redirect_uri%3Dhttps%253A%252F%252Fliveapi.macmillaneducationeverywhere.com%252Fapi%252Foidcintegration%252Fcode%26response_type%3Dcode%26scope%3Dopenid%2520profile%2520offline_access%26code_challenge_method%3DS256%26code_challenge%3Dno-81rQrMJwoLhRrryqaEx7ZBNWokrmhhAD98uIz5fo%26state%3Daf32b1c7-a894-47d9-842f-73d9fff373f7";
const BLINK_LOGIN_URL = "https://www.blinklearning.com/v/1774948299/themes/tmpux/launch.php";

type Provider = "english" | "blink";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, "true");
      continue;
    }
    args.set(key, next);
    index += 1;
  }

  const provider = (args.get("provider") || "").trim().toLowerCase() as Provider;
  const email = (args.get("email") || "").trim().toLowerCase();
  const headless = args.get("headless") === "true";

  if (!email) {
    throw new Error("Falta --email. Ejemplo: --email alumno@centro.es");
  }

  if (provider !== "english" && provider !== "blink") {
    throw new Error('Falta --provider con valor "english" o "blink".');
  }

  return { provider, email, headless };
}

async function firstVisible(locators: Locator[]): Promise<Locator | null> {
  for (const locator of locators) {
    if (await locator.count()) {
      const candidate = locator.first();
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
  }

  return null;
}

async function fillFirstVisible(page: Page, email: string) {
  const input = await firstVisible([
    page.getByLabel(/correo|email|e-mail/i),
    page.getByLabel(/usuario|nombre de usuario/i),
    page.getByPlaceholder(/correo|email|e-mail/i),
    page.getByPlaceholder(/usuario|nombre de usuario/i),
    page.locator('input[type="email"]'),
    page.locator('input[name*="email" i]'),
    page.locator('input[name*="user" i]'),
    page.locator('input[id*="email" i]'),
    page.locator('input[id*="user" i]'),
    page.locator('input:not([type="hidden"])'),
  ]);

  if (!input) {
    throw new Error("No he encontrado un campo de email/usuario visible.");
  }

  await input.fill(email);
}

async function clickFirstVisible(page: Page, candidates: Locator[], errorMessage: string) {
  const button = await firstVisible(candidates);
  if (!button) {
    throw new Error(errorMessage);
  }

  await button.click();
}

async function waitForSuccess(page: Page) {
  const successMessage = await firstVisible([
    page.getByText(/te hemos enviado un email/i),
    page.getByText(/restablecer tu contraseña/i),
    page.getByText(/check your email/i),
  ]);

  if (!successMessage) {
    throw new Error("No he podido confirmar el mensaje final de recuperación.");
  }
}

async function handleEnglish(page: Page, email: string) {
  await page.goto(MEE_FORGOT_PASSWORD_URL, { waitUntil: "domcontentloaded" });
  await fillFirstVisible(page, email);

  await clickFirstVisible(
    page,
    [
      page.getByRole("button", { name: /introduce tu nombre de usuario/i }),
      page.getByRole("button", { name: /nombre de usuario/i }),
      page.getByRole("button", { name: /enviar/i }),
      page.getByRole("button", { name: /continuar/i }),
      page.locator("button[type='submit']"),
      page.locator("input[type='submit']"),
    ],
    'No he encontrado el botón "Introduce tu nombre de usuario".',
  );

  await waitForSuccess(page);
}

async function handleBlink(page: Page, email: string) {
  await page.goto(BLINK_LOGIN_URL, { waitUntil: "domcontentloaded" });

  await clickFirstVisible(
    page,
    [
      page.getByRole("button", { name: /olvid[eé] mi contraseña/i }),
      page.getByText(/olvid[eé] mi contraseña/i).locator(".."),
      page.locator("button").filter({ hasText: /olvid[eé] mi contraseña/i }),
    ],
    'No he encontrado el botón "Olvidé mi contraseña" en Blink.',
  );

  await fillFirstVisible(page, email);

  await clickFirstVisible(
    page,
    [
      page.getByRole("button", { name: /introduce tu nombre de usuario/i }),
      page.getByRole("button", { name: /enviar/i }),
      page.getByRole("button", { name: /continuar/i }),
      page.locator("button[type='submit']"),
      page.locator("input[type='submit']"),
    ],
    "No he encontrado el botón final para enviar la recuperación en Blink.",
  );

  await waitForSuccess(page);
}

async function main() {
  const { provider, email, headless } = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  try {
    if (provider === "english") {
      await handleEnglish(page, email);
    } else {
      await handleBlink(page, email);
    }

    console.log(`Recuperación lanzada correctamente para ${email} (${provider}).`);
    console.log("Se ha detectado el mensaje final de confirmación.");
  } finally {
    if (headless) {
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

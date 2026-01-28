# Покроковий деплой FiftyFive Labs на Render

## Крок 1. GitHub-репозиторій

1. Відкрий [GitHub](https://github.com) і залогінься.
2. Створи новий репозиторій:
   - **New** → назва, наприклад `fiftyfive-labs`.
   - Public, без README.
   - **Create repository**.
3. У папці проекту виконай у терміналі:

```bash
cd /шлях/до/твоєї/папки/fiftyfive-labs

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ТВІЙ_ЮЗЕР/fiftyfive-labs.git
git push -u origin main
```

Підстав **ТВІЙ_ЮЗЕР** та URL свого репо. Якщо репо вже є — просто `git add . && git commit -m "Deploy prep" && git push`.

---

## Крок 2. Реєстрація на Render

1. Зайди на [render.com](https://render.com).
2. **Get Started** → увійди через **GitHub**.
3. Дозволь Render доступ до GitHub-акаунта (і при потребі до репо).

---

## Крок 3. Новий Web Service

1. У [Render Dashboard](https://dashboard.render.com) натисни **New +** → **Web Service**.
2. **Connect a repository** → обери репо **fiftyfive-labs** (або як ти його назвав).
3. Якщо репо не видно — **Configure account** і дай доступ до потрібних репозиторіїв.
4. Після вибору репо натисни **Connect**.

---

## Крок 4. Налаштування сервісу

1. **Name** — залиш `fiftyfive-labs` або зміни на свій.
2. **Region** — обери регіон (наприклад **Frankfurt**).
3. **Branch** — `main` (або гілка, з якої деплоїш).
4. **Runtime** — обери **Docker**.
5. **Instance Type** — **Starter** (або інший за тарифом).

Render має підхопити `Dockerfile` з кореня. Якщо окремо вказано **Dockerfile Path** — залиш порожнім або `./Dockerfile`.

---

## Крок 5. Змінні оточення (Environment Variables)

У блоці **Environment Variables** додай:

| Key | Value | Секрет? |
|-----|--------|--------|
| `ADMIN_TOKEN` | **Придумай надійний пароль** для /admin | ✅ **Yes** |
| `IMAGE_API_KEY` | Ключ з [Together AI](https://api.together.xyz) | ✅ **Yes** |

Інші змінні (`IMAGE_API_URL`, `DEBUG`, `ALLOWED_ORIGINS`, `DATA_DIR`, `DB_PATH` тощо) вже задані в `render.yaml`. Якщо використовуєш **Blueprint** (крок 6) — їх можна не дублювати вручну.

- Натисни **Add Environment Variable**.
- **Key**: `ADMIN_TOKEN`, **Value**: твій секрет.
- Включи **Secret** (іконка замка) для `ADMIN_TOKEN` і `IMAGE_API_KEY`.

---

## Крок 6. Disk (база даних і файли)

1. У **Disks** натисни **Add Disk**.
2. **Name**: `fiftyfive-data`.
3. **Mount Path**: `/app/data`.
4. **Size**: 10 GB (або більше за потреби).

Це потрібно для SQLite, згенерованих зображень і аудіо.

---

## Крок 7. Деплой

1. Переконайся, що **Health Check Path**: `/api/health` (зазвичай підставляється з `render.yaml`).
2. Натисни **Create Web Service**.
3. Render почне збірку Docker-образу і деплой. Це може зайняти 5–15 хвилин.
4. У **Logs** побачиш вивід збірки й запуску. Помилки з’являться там же.

---

## Крок 8. Перевірка

1. Коли статус стане **Live**, з’явиться посилання типу  
   `https://fiftyfive-labs-xxxx.onrender.com`.
2. Відкрий у браузері:
   - головна: `https://твій-сервіс.onrender.com`
   - адмінка: `https://твій-сервіс.onrender.com/admin`
   - API docs: `https://твій-сервіс.onrender.com/docs`
3. Для /admin потрібен заголовок **X-Admin-Token** з значенням `ADMIN_TOKEN`. Це зазвичай робиться через форму логіну в UI або окремий вхід для адміна.

---

## Деплой через Blueprint (render.yaml)

Якщо хочеш використати **Blueprint** і майже все налаштувати з репо:

1. У Dashboard: **New +** → **Blueprint**.
2. Обери репо **fiftyfive-labs**.
3. Render прочитає `render.yaml` і створить Web Service + Disk.
4. Далі **обов’язково** вручну введи **Environment Variables**:
   - `ADMIN_TOKEN` (Secret)
   - `IMAGE_API_KEY` (Secret)  
   У `render.yaml` вони позначені `sync: false`, тобто їх треба задати в Dashboard.

Після цього деплой і подальші оновлення теж через Git push або ручний **Manual Deploy** у Render.

---

## Що робити якщо не запускається

1. **Logs** (вкладка **Logs** у сервісі) — дивись на Python-помилки, відсутні модулі, помилки з БД.
2. **Environment** — переконайся, що `ADMIN_TOKEN` і `IMAGE_API_KEY` задані і позначені як Secret.
3. **Disk** — `Mount Path` саме `/app/data`, як у `render.yaml`.
4. **Health Check** — має бути `/api/health`. Якщо він не проходить, Render може вважати сервіс мертвим.

---

## Подальші оновлення

Після змін у коді:

```bash
git add .
git commit -m "Опис змін"
git push origin main
```

При увімкненому **Auto-Deploy** Render сам зробить новий деплой. Інакше — **Manual Deploy** у Dashboard.

---

## Чеклист перед деплоєм

- [ ] Репо на GitHub створено, код запушений
- [ ] Render: Web Service, Runtime = **Docker**
- [ ] Додано **ADMIN_TOKEN** (Secret) і **IMAGE_API_KEY** (Secret)
- [ ] Додано **Disk**: mount `/app/data`, ~10 GB
- [ ] Health Check Path = `/api/health`
- [ ] Після деплою перевірено головну сторінку, /admin, /docs

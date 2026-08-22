type Results = Record<string, boolean>;

export function registerHttpHandler(exerciseWebApis: () => Promise<Results>) {
    addEventListener('fetch', (event) => {
        event.respondWith(
            exerciseWebApis().then(
                (results) => Response.json({ results }),
                (error) => Response.json({ error: String(error) }, { status: 500 }),
            ),
        );
    });
}

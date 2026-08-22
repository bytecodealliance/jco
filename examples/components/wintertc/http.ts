export type Results = Record<string, boolean>;

type FetchEvent = Event & {
    respondWith(response: Response | Promise<Response>): void;
};

export function registerHttpHandler(exerciseWebApis: () => Promise<Results>): void {
    addEventListener('fetch', (event: Event) => {
        const fetchEvent = event as FetchEvent;
        fetchEvent.respondWith(
            exerciseWebApis().then(
                (results) => Response.json({ results }),
                (error) => Response.json({ error: String(error) }, { status: 500 }),
            ),
        );
    });
}

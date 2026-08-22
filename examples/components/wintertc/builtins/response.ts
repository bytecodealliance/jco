type PortableResponse = {
    portable: boolean;
};

export async function testResponse(): Promise<boolean> {
    const response = Response.json({ portable: true }, { status: 201 });
    const body = (await response.json()) as PortableResponse;
    return response.status === 201 && body.portable === true;
}

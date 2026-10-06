export default {
    resolve: {
        // Select dependencies' portable entry points. In particular, debug's Node entry
        // registers process deprecation warnings that are unavailable in a component.
        mainFields: ["browser", "module", "main"],
    },
};

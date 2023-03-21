module.exports = {
  routes: [
    {
      method: "GET",
      path: "/hubspot/authorization",
      handler: "hubspot.authorization",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/hubspot/recordDetails",
      handler: "hubspot.recordDetails",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/hubspot/runDuplicator",
      handler: "hubspot.runDuplicator",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

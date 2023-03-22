"use strict";
const axios = require("axios");
const hubspot = require("@hubspot/api-client");
let retryThreshold = 0;

/**
 * A set of functions called "actions" for `hubspot`
 */

module.exports = {
  authorization: async (ctx, next) => {
    const paramsArr = ctx.url.split("?")[1];
    const urlSearchParams = new URLSearchParams(paramsArr);
    const params = Object.fromEntries(urlSearchParams.entries());
    const { code } = params;
    const generateTokenUrl = `https://api.hubapi.com/oauth/v1/token`;
    const generateFirstTimeToken = async () => {
      const formData = {
        grant_type: "authorization_code",
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        redirect_uri: process.env.HUBSPOT_REDIRECT_URI,
        code,
      };
      const axiosHeaders = {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      };
      const response = await axios.post(
        generateTokenUrl,
        formData,
        axiosHeaders
      );
      const { data } = response;
      const accessToken = data.access_token;
      const refreshToken = data.refresh_token;
      const portalIdReq = await axios.get(
        `https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`
      );
      const hubDetails = {
        hubId: portalIdReq.data.hub_id.toString(),
        hubDomain: portalIdReq.data.hub_domain,
        user: portalIdReq.data.user,
      };
      const { hubId, hubDomain, user } = hubDetails;
      const entry = await strapi.entityService.create("api::portal.portal", {
        data: {
          accessToken,
          refreshToken,
          hubId,
          hubDomain,
          user,
        },
      });
      ctx.send({
        success: true,
        message: `Access Token saved successfully for portal id ${hubId}`,
        data: {
          accessToken,
          refreshToken,
          hubId,
          hubDomain,
          user,
        },
      });
    };
    try {
      await generateFirstTimeToken();
    } catch (err) {
      const status = err.response?.data?.status;
      if (status === "BAD_AUTH_CODE") {
        ctx.body = {
          error: true,
          message: "Authorization Code Expired -- generating new",
        };
      } else {
        console.log(err);
        ctx.body = err;
      }
    }
  },
  recordDetails: async (ctx, next) => {
    const action = async () => {
      const paramsArr = ctx.url.split("?")[1];
      const urlSearchParams = new URLSearchParams(paramsArr);
      const params = Object.fromEntries(urlSearchParams.entries());
      const { portalId, associatedObjectId } = params;
      ctx.send({
        results: [],
        primaryAction: {
          type: "CONFIRMATION_ACTION_HOOK",
          httpMethod: "POST",
          uri: `${process.env.API_URL}/hubspot/runDuplicator?portalId=${portalId}&objectId=${associatedObjectId}`,
          label: "Duplicate This Record",
          associatedObjectProperties: ["demo_crm_property"],
          confirmationMessage:
            "Are you sure you want to duplicate this record?",
          confirmButtonText: "Yes",
          cancelButtonText: "No",
        },
      });
    };
    try {
      await action();
    } catch (err) {
      ctx.body = err;
    }
  },
  runDuplicator: async (ctx, next) => {
    const paramsArr = ctx.url.split("?")[1];
    const urlSearchParams = new URLSearchParams(paramsArr);
    const params = Object.fromEntries(urlSearchParams.entries());
    const { portalId, objectId } = params;
    const entries = await strapi.entityService.findMany("api::portal.portal", {
      fields: ["accessToken", "refreshToken"],
      filters: { hubId: portalId },
    });
    const { accessToken, refreshToken, id } = entries[0];
    const hubspotClient = new hubspot.Client({ accessToken: accessToken });
    let allProperties;
    let clonedProperties;

    const action = async () => {
      const getAllAvailableProperties = async () => {
        const objectType = "contacts";
        const archived = false;
        const properties = undefined;
        const data = await hubspotClient.crm.properties.coreApi.getAll(
          objectType,
          archived,
          properties
        );
        const editableProperties = data.results.filter((elem) => {
          return !elem.modificationMetadata.readOnlyValue;
        });
        const allContactPropertyNames = editableProperties.map((elem) => {
          return elem.name;
        });
        allProperties = allContactPropertyNames;
        // ctx.send({
        //   allProperties,
        // });
      };

      const getPropertiesOfRecordById = async () => {
        const contactId = objectId;
        const properties = allProperties;
        const propertiesWithHistory = undefined;
        const associations = undefined;
        const archived = false;
        const data = await hubspotClient.crm.contacts.basicApi.getById(
          contactId,
          properties,
          propertiesWithHistory,
          associations,
          archived
        );
        clonedProperties = data.properties;
        const updatedEmail = data.properties.email.split("@");
        clonedProperties.email = `${updatedEmail[0]}__cloned__${Math.floor(
          Math.random() * 10000000
        )}@${updatedEmail[1]}`;
        clonedProperties.lastname = `${data.properties.lastname} (Cloned)`;
        delete clonedProperties.lastmodifieddate;
        delete clonedProperties.createdate;
        delete clonedProperties.hs_object_id;
        // ctx.send({
        //   clonedProperties,
        // });
      };

      const cloneRecord = async () => {
        const SimplePublicObjectInputForCreate = {
          properties: clonedProperties,
          associations: [],
        };
        const data = await hubspotClient.crm.contacts.basicApi.create(
          SimplePublicObjectInputForCreate
        );
        ctx.send({
          message: `Successfully cloned record ${clonedProperties.email}`,
          data: data,
        });
      };

      await getAllAvailableProperties();
      await getPropertiesOfRecordById();
      await cloneRecord();
    };
    try {
      await action();
    } catch (err) {
      if (err.body && err.body.category === "EXPIRED_AUTHENTICATION") {
        const formData = {
          grant_type: "refresh_token",
          client_id: process.env.HUBSPOT_CLIENT_ID,
          client_secret: process.env.HUBSPOT_CLIENT_SECRET,
          redirect_uri: process.env.HUBSPOT_REDIRECT_URI,
          refresh_token: refreshToken,
        };
        const axiosHeaders = {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        };
        const response = await axios.post(
          `https://api.hubapi.com/oauth/v1/token`,
          formData,
          axiosHeaders
        );
        const { data } = response;
        const updatedAccessToken = data.access_token;
        const updatedRefreshToken = data.refresh_token;
        const entry = await strapi.entityService.update(
          "api::portal.portal",
          id,
          {
            data: {
              accessToken: updatedAccessToken,
              refreshToken: updatedRefreshToken,
            },
          }
        );
        retryThreshold++;
        if (retryThreshold < 3) {
          console.log(
            `successfully updated tokens -- calling runDuplicator again.`
          );
          return module.exports.runDuplicator(ctx);
        } else {
          ctx.body = err;
        }
      } else {
        console.log(err);
        ctx.body = err;
      }
    }
  },
};

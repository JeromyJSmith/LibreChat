const { EModelEndpoint } = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { isUserProvided, extractEnvVariable } = require('~/server/utils');
const getCustomConfig = require('~/cache/getCustomConfig');
const { OpenAIClient } = require('~/app');

const { PROXY } = process.env;

const initializeClient = async ({ req, res, endpointOption }) => {
  const { key: expiresAt, endpoint } = req.body;
  const customConfig = await getCustomConfig();
  if (!customConfig) {
    throw new Error(`Config not found for the ${endpoint} custom endpoint.`);
  }

  const { endpoints = {} } = customConfig;
  const customEndpoints = endpoints[EModelEndpoint.custom] ?? [];
  const endpointConfig = customEndpoints.find((endpointConfig) => endpointConfig.name === endpoint);

  const CUSTOM_API_KEY = extractEnvVariable(endpointConfig.apiKey);
  const CUSTOM_BASE_URL = extractEnvVariable(endpointConfig.baseURL);

  const customOptions = {
    addParams: endpointConfig.addParams,
    dropParams: endpointConfig.dropParams,
    titleConvo: endpointConfig.titleConvo,
    titleModel: endpointConfig.titleModel,
    forcePrompt: endpointConfig.forcePrompt,
    summaryModel: endpointConfig.summaryModel,
    modelDisplayLabel: endpointConfig.modelDisplayLabel,
    titleMethod: endpointConfig.titleMethod ?? 'completion',
    contextStrategy: endpointConfig.summarize ? 'summarize' : null,
  };

  const useUserKey = isUserProvided(CUSTOM_API_KEY);
  const useUserURL = isUserProvided(CUSTOM_BASE_URL);

  let userValues = null;
  if (expiresAt && (useUserKey || useUserURL)) {
    checkUserKeyExpiry(
      expiresAt,
      `Your API values for ${endpoint} have expired. Please configure them again.`,
    );
    userValues = await getUserKey({ userId: req.user.id, name: endpoint });
    try {
      userValues = JSON.parse(userValues);
    } catch (e) {
      throw new Error(`Invalid JSON provided for ${endpoint} user values.`);
    }
  }

  let apiKey = useUserKey ? userValues.apiKey : CUSTOM_API_KEY;
  let baseURL = useUserURL ? userValues.baseURL : CUSTOM_BASE_URL;

  if (!apiKey) {
    throw new Error(`${endpoint} API key not provided.`);
  }

  if (!baseURL) {
    throw new Error(`${endpoint} Base URL not provided.`);
  }

  const clientOptions = {
    reverseProxyUrl: baseURL ?? null,
    proxy: PROXY ?? null,
    req,
    res,
    ...customOptions,
    ...endpointOption,
  };

  const client = new OpenAIClient(apiKey, clientOptions);
  return {
    client,
    openAIApiKey: apiKey,
  };
};

module.exports = initializeClient;

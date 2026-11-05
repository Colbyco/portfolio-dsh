<template>
  <v-app theme="dark">
    
    <v-app-bar app>
      <v-btn
        icon="mdi-cog-outline"
        color="primary"
        @click.stop="drawer = !drawer"
      ></v-btn>

      <v-btn
        icon="mdi-github"
        color="primary"
        href="https://github.com/Colbyco"
        target="_blank"
      ></v-btn>

      <v-btn
        icon="mdi-linkedin"
        color="primary"
        href="https://www.linkedin.com/in/bakercolby/"
        target="_blank"
      ></v-btn>

      <v-btn
        icon="mdi-email"
        color="primary"
        @click="copyToClipBoard('Colbyco017@gmail.com')"
      ></v-btn>

    </v-app-bar>

    <v-navigation-drawer v-model="drawer" temporary>
        <div class="settingsSliders pt-2 pl-2">
          <div class="temperatureSetting">
            <div class="temperatureLabel">
              <span 
                class="text-center settingsText"
                >
                Temperature</span>
            </div>
  
            <div class="temperatureSlider">
              <v-slider
                v-model="temperatureSlider"
                class="align-center"
                :max="1.0"
                :min="0.1"
                :step="0.1"
                hide-details
              >
                <template v-slot:append>
                  <v-text-field
                    v-model="temperatureSlider"
                    color="primary"
                    hide-details
                    single-line
                    density="compact"
                    type="number"
                    style="width: 75px"
                  ></v-text-field>
                </template>
              </v-slider>
            </div>
          </div>
          
          <div class="tokensSetting mt-10">
            <div class="tokensLabel">
              <span 
                class="text-center settingsText"
                >
                Max Tokens</span>
            </div>
  
            <div class="tokensSlider">
              <v-slider
                v-model="tokensSlider"
                class="align-center"
                :max="1500"
                :min="200"
                :step="50"
                hide-details
              >
                <template v-slot:append>
                  <v-text-field
                    v-model="tokensSlider"
                    color="primary"
                    hide-details
                    single-line
                    density="compact"
                    type="number"
                    style="width: 90px">
                  </v-text-field>
                </template>
              </v-slider>
            </div>
          </div>
        </div>

          <div class="apiKeyInput pt-10">
            <v-text-field 
              density="compact"
              v-model="userAPIKey"
              color="primary"
              :counter="51" 
              :rules="[apiLengthValidation(userAPIKey), apiValidation(userAPIKey)]"
              label="API Key">
            </v-text-field>
          </div>

          <a class="settingsText ml-2" href="https://beta.openai.com/account/api-keys" target="_blank">
              Get Your Key Here
          </a>
    </v-navigation-drawer>

    <!-- Sizes your content based upon application components -->
    <div class="wrapper">
      <v-main>
        <div class="messages">
          <ul v-for="{ message, from } in messageArray" v-bind:class="{'userMessage': from === 'user', 'aiMessage': !(from === 'user')}">
            <div v-bind:class="{'userBubble': from === 'user', 'aiBubble': !(from === 'user')}">
              {{ message }}
            </div>
          </ul>
        </div>
      </v-main>
    </div>

      <v-footer class="mb" height="100" app>
        <v-text-field 
          density="default"
          class="textField"
          autofocus
          v-model="userMessage"
          @keydown.enter.prevent="apiCall(userMessage)"
          color="primary"
          :counter="100" 
          :rules="[messageLengthValidation(userMessage), apiValidation(userAPIKey)]"
          label="Message">
        </v-text-field>
        <v-btn class="ml-3 mb-10" color="primary" @click="apiCall(userMessage)">Send</v-btn>
      </v-footer>
  </v-app>
</template>

<script setup>
import { ref } from 'vue'
// [preview] original: import { Configuration, OpenAIApi } from 'openai'
import { Configuration, OpenAIApi, hasPreviewKey } from '../portfolio/openai-bridge.js'

// reactive state
const userMessage = ref('');
const aiResponse = ref('');
const temperatureSlider = ref(0.7);
const tokensSlider = ref(1000);
const userAPIKey = ref('');
const messageArray = ref([]);
const drawer = ref(null);
const validation = ref(false);

// functions that mutate state and trigger updates
async function apiCall(m) {

  
  // [preview] original: if(m.length > 100 || !validation.value) {
  // The bridge now decides which key (if any) to use and answers with a notice when there is none.
  if(m.length > 100) {
    // Do nothing
  }

  else {
    m = m.trim()
    
    const configuration = new Configuration({
      apiKey: userAPIKey.value,
    });
      
    const openai = new OpenAIApi(configuration);
  
    const response = await openai.createCompletion({
      model: "text-davinci-002",
      prompt: `You are a chat bot\n--------\nuser:${m}\nyou:`,
      max_tokens: tokenSliderInput(tokensSlider),
      temperature: sliderInput(temperatureSlider),
    });

    const reply = (response.data.choices[0].text).trim()
    aiResponse.value = reply;

    messageArray.value.push({ message: m, from: 'user' });
    messageArray.value.push({ message: aiResponse.value, from: 'ai' });

    userMessage.value = '';
  }
}

function sliderInput(slider) {
  if(slider.value >= 0.1 && slider.value <= 1.0) {
    return slider.value;
  }
  else {
    return 0.9
  }
}

function tokenSliderInput(slider) {
  if(slider.value >= 200 && slider.value <= 1500) {
    return slider.value;
  }
  else {
    return 1500
  }
}

async function apiValidation(key) {
  // [preview] a key set in the portfolio bar satisfies the original key check
  if(hasPreviewKey()) {
    return true;
  }

  if(key.length === 51) {
    try {
      const configuration = new Configuration({
        apiKey: key,
      });
  
      const openai = new OpenAIApi(configuration);
  
      await openai.listModels();
  
      validation.value = true;
    }
  
    catch {
      validation.value = false;
      return 'Please Enter a Valid API Key'
    }
  }
  else {
    return 'Please Enter a Valid API Key'
  }
}


function apiLengthValidation(key) {
  if(key.length > 51) {
    return 'Key must be 51 characters'
  }
  else {
    return true;
  }
}

function messageLengthValidation(m) {
  if(m.length > 100) {
    return 'Message Must be 100 Characters or Less'
  }
  else {
    return true;
  }
}


function copyToClipBoard(email) {
  navigator.clipboard.writeText(email);
}
    
</script>

<!-- CSS Bullshit -->
<style>
  .settingsText {
    color: #b982f5;
  }

  .messages {
    font-family: "Arial";
    font-size: 18px;
    margin-top: 10px;
  }

  .aiMessage {
    color: white;
    min-width: 10px;
    padding-left: 3px;
    margin-top: 10px;
    max-width: 500px;
    overflow-wrap: break-word;
  }

  .userMessage {
    color: white;
    min-width: 10px;
    max-width: 580px;
    text-align: right;
    margin-right: 10px;
    margin-top: 10px;
    overflow-wrap: break-word;
  }

  .aiBubble {
    display: inline-block;
    min-width: 10px;
    background-color: #869e6c;
    padding: 7px 10px;
    border-radius: 10px 10px 10px 0px;
    margin: 10px;
    max-width: 500px;
    overflow-wrap: break-word;
  }

  .userBubble {
    display: inline-block;
    min-width: 10px;
    max-width: 580px;
    background-color: #b982f5;
    padding: 7px 10px;
    border-radius: 10px 10px 0px 10px;
    overflow-wrap: break-word;
  }

  .wrapper {
    margin-left: 35%;
    height: 900px;
    width: 600px;
    overflow: auto; 
    display: flex; 
    flex-direction: column-reverse;
  }
</style>
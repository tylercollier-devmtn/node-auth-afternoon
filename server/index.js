const express = require('express');
const session = require('express-session');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();


const app = express();

app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}))

app.get('/auth/callback', (req, res) => {
  exchangeCodeForAccessToken()
    .then(exchangeAccessTokenForUserInfo)
    .then(fetchAuth0AccessToken)
    .then(fetchGitHubAccessToken)
    .then(setGitTokenToSession)
    .catch(err => {console.log('You have an error', err); res.status(500).send('An error occurred on the server. Check the terminal.')});


  function exchangeCodeForAccessToken() {
    const payload = {
      client_id: process.env.REACT_APP_AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      code: req.query.code,
      grant_type: 'authorization_code',
      redirect_uri: `http://${req.headers.host}/callback`
    };
    return axios.post(`https://${process.env.REACT_APP_AUTH0_DOMAIN}/oauth/token`, payload);
  }

  function exchangeAccessTokenForUserInfo(accessTokenResponse){
    const {access_token} = accessTokenResponse.data;
    return axios.get(`https://${process.env.REACT_APP_AUTH0_DOMAIN}/userinfo?access_token=${access_token}`);
  }
  function fetchAuth0AccessToken(userInfoResponse){
    req.session.user = userInfoResponse.data;
    const { AUTH0_API_CLIENT_ID: client_id, AUTH0_API_CLIENT_SECRET: client_secret, REACT_APP_AUTH0_DOMAIN: domain} = process.env;
    const payload = {
      grant_type: 'client_credentials',
      client_id,
      client_secret,
      audience: `https://${domain}/api/v2/`
    };
    return axios.post(`https://${domain}/oauth/token`, payload)
  }

  function fetchGitHubAccessToken(auth0AccessTokenResponse){
    const options = {
      headers: {
        authorization: `Bearer ${auth0AccessTokenResponse.data.access_token}`,
      },
    };
    return axios.get(`https://${process.env.REACT_APP_AUTH0_DOMAIN}/api/v2/users/${req.session.user.sub}`, options)
  }

  function setGitTokenToSession(gitHubAccessTokenResponse) {
    const githubIdentity = gitHubAccessTokenResponse.data.identities[0];
    req.session.gitHubAccessToken = githubIdentity.access_token;
    res.redirect('/');
  }

});

app.put('/api/star', (req, res) => {
  const {gitUser, gitRepo} = req.query;
  axios.put(`https://api.github.com/user/starred/${gitUser}/${gitRepo}?access_token=${req.session.gitHubAccessToken}`)
  .then(() => {res.end()}).catch(err => console.log('Error starring repo', err));
})
app.delete('/api/star', (req, res) => {
  const {gitUser, gitRepo} = req.query;
  axios.delete(`https://api.github.com/user/starred/${gitUser}/${gitRepo}?access_token=${req.session.gitHubAccessToken}`)
  .then(() => {res.end()}).catch(err => console.log('Error unstarring repo', err));
})

app.get('/api/user-data', (req, res) => {
  res.status(200).json(req.session.user)
})

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.send('logged out');
})

const port = 4000;
app.listen(port, () => { console.log(`Server listening on port ${port}`); });

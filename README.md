# GCloud-PersonalFinance

Originally a project for a Cloud Application Development course at Oregon State University, this code implements a RESTful API via Google Cloud's App Engine. See the included specification document (GCloud-PersonalFinance_Spec.pdf) for details.

## ToDo

1: Authentication is handled with a custom implementation of Google's OAuth 2.0 API. This should be replaced with Google's own OAuth library for security. The custom code handles 'state' as a global variable, which could lead to problems if more than one user is authenticating at the same time.

2: The UI used to authenticate/generate the JWT could use some work to make it more appealing.

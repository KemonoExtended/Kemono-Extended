<h1>Kemono Extended</h1>

Kemono Extended is a Firefox addon that aims to provide additional functionality to [Kemono.su](https://kemono.su) and [Coomer.su](https://coomer.su).<br><br>


<h2>Features</h2>

<details>
   <summary>
      Download button
   </summary>
   The addon adds a download button to every image in a post.<br>
   When clicked it downloads the image in the highest available quality.
</details>
<details>
   <summary>
      Sequential downloads - Desktop only
   </summary>
   Only one downloads is ever active at the same time. <br>
   Images are downloaded in the order that you clicked the download buttons.<br>
   Downloads are handled in the background so you can leave the site<br>
   and the downloads will continue in the background.
</details>
<details>
   <summary>
      Mobile downloads - Mobile only
   </summary>
   Because of restrictions downloads on mobile devices are not sequential.<br>
   Downloads also don't work in the background.<br>
   This means that you need to stay on the same page until you get the download popup.
</details>
<details>
   <summary>
      Mouse wheel navigation - Desktop only
   </summary>
   Tilt your mouse wheel to navigate across pages.
</details>
<details>
   <summary>
      Swipe navigation - Mobile only
   </summary>
   Swipe on the screen to navigate across pages.
</details>
<details>
   <summary>
      Restore post thumbnails
   </summary>
   When a post doesn't have a thumbnail, the addon tries to get an image<br>
   from the post to set as the thumbnail.<br>
   If the post doesn't contain images, the addon uses the post itself as the thumbnail.<br>
   This is limited to one thumbnail every ~1 second because of rate limiting.
</details>
<details>
   <summary>
      Mark visited posts
   </summary>
   When you open a post it gets marked as "Read".
</details>
<details>
   <summary>
      Read all button
   </summary>
   Adds a "Read all" button to creator pages.<br>
   When pressed it marks every current post as "Seen".<br>
   This can be undone by pressing the button again.
</details>
<details>
   <summary>
      Subscriptions - Desktop only
   </summary>
   When you subscribe to a creator on their creator page, the addon periodically checks if they have new posts.
   If the addon finds new posts, it notifies you with a notification.
</details>
<details>
   <summary>
      Mark unread creators
   </summary>
   The addon marks favorited artists on your favorites pages if they have new posts.
</details>
<br><br>


<h2>Building</h2>
  
Steps to build:<br>
```
npm install --save-dev webpack
npm install --save-dev web-ext
webpack
web-ext build --overwrite-dest
```

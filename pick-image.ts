import { get } from 'request-promise';
import { getRndInteger } from './global';
let tags = '#ig_engagements_bot #animalcruelty #petslover #petsittinglife #catsarethebest #catsdaily #petsfofos #petsdobrasil #animalcrossingmemes #petsuniversal #animalpolis #catslove #cats🐱 #catskills #petsoriginal #catsareawesome #cutechihuahua #animal_captures #animalcare #animallove #petstargram #petstagraam #cats_of_day #animalmemes #animalworld #catsgram'
export const igImage = async () => {
    let page = getRndInteger(1, 9990)
    console.log('page number:', page);
    let imageBuffer;
    //const image = await get({
       // url: `https://api.unsplash.com/search/photos?query=cats&client_id=41vOlMM0_RVBm4qJVScTEsVJ6aM3qpy9e3bUv6AP6MA&content_filter=high&per_page=1&page=${page}`, // random picture with 800x800 size
        // encoding: null, // this is required, only this way a Buffer is returned
       // json: true
    //});
    //if (!image?.results || !image?.results.length || !image?.results[0].urls.full) {
     if(true){   
        imageBuffer = await get({
            url: 'https://picsum.photos/800/800', // random picture with 800x800 size
            encoding: null, // this is required, only this way a Buffer is returned
        });
        console.log('not found');

        return {
            desc: tags,
            image: imageBuffer
        };
    }
    let item = image?.results[0]
    imageBuffer = await get({
        url: `${image?.results[0].urls.full}&fit=fill&ar=1.9:1&w=1080&h=1080`,
        encoding: null, // this is required, only this way a Buffer is returned
    });
    return {
        desc: `${item.alt_description} ${tags}`,
        image: imageBuffer
    };
}
